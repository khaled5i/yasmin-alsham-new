param(
  [switch]$Once,
  [string]$ConfigPath = (Join-Path $PSScriptRoot '.runtime\config.json')
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-ConnectorLog {
  param([string]$Message, [string]$Level = 'INFO')

  $runtimeDirectory = Split-Path -Parent $ConfigPath
  if (-not (Test-Path -LiteralPath $runtimeDirectory)) {
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
  }

  $logPath = Join-Path $runtimeDirectory 'connector.log'
  if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 5MB) {
    Move-Item -LiteralPath $logPath -Destination (Join-Path $runtimeDirectory 'connector.previous.log') -Force
  }

  $line = '{0} [{1}] {2}' -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $Level, $Message
  Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
  Write-Host $line
}

function Get-PlainText {
  param([Security.SecureString]$SecureValue)

  $credential = New-Object System.Net.NetworkCredential('', $SecureValue)
  return $credential.Password
}

function Get-Md5Upper {
  param([string]$Value)

  $md5 = [Security.Cryptography.MD5]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    return ([BitConverter]::ToString($md5.ComputeHash($bytes))).Replace('-', '').ToUpperInvariant()
  } finally {
    $md5.Dispose()
  }
}

function Get-Sha256Lower {
  param([string]$Value)

  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Invoke-DahuaJson {
  param(
    [Parameter(Mandatory = $true)][string]$Address,
    [Parameter(Mandatory = $true)][Microsoft.PowerShell.Commands.WebRequestSession]$WebSession,
    [Parameter(Mandatory = $true)][Collections.IDictionary]$Payload,
    [string]$Operation = 'device request',
    [switch]$Login
  )

  $path = if ($Login) { '/RPC2_Login' } else { '/RPC2' }
  $body = $Payload | ConvertTo-Json -Compress -Depth 20
  $previousCertificateCallback = [Net.ServicePointManager]::ServerCertificateValidationCallback

  try {
    # The terminals use a local self-signed certificate. The bypass exists only
    # for this in-process LAN request and is restored before any internet upload.
    [Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    try {
      return Invoke-RestMethod `
        -Uri ($Address.TrimEnd('/') + $path) `
        -Method Post `
        -WebSession $WebSession `
        -ContentType 'application/json; charset=utf-8' `
        -Body ([Text.Encoding]::UTF8.GetBytes($body)) `
        -TimeoutSec 20
    } catch {
      throw "$Operation failed: $($_.Exception.Message)"
    }
  } finally {
    [Net.ServicePointManager]::ServerCertificateValidationCallback = $previousCertificateCallback
  }
}

function Open-DahuaSession {
  param(
    [Parameter(Mandatory = $true)]$Device,
    [Parameter(Mandatory = $true)][Management.Automation.PSCredential]$Credential
  )

  $webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $username = $Credential.UserName
  $password = Get-PlainText -SecureValue $Credential.Password

  $firstPayload = [ordered]@{
    method = 'global.login'
    params = [ordered]@{
      userName = $username
      password = ''
      clientType = 'Web3.0'
    }
    id = 1
  }
  $first = Invoke-DahuaJson -Address $Device.address -WebSession $webSession -Payload $firstPayload -Operation 'login challenge' -Login

  if (-not $first.session -or -not $first.params.realm -or -not $first.params.random) {
    throw 'The device did not return the expected login challenge.'
  }

  $realmHash = Get-Md5Upper -Value ('{0}:{1}:{2}' -f $username, $first.params.realm, $password)
  $loginHash = Get-Md5Upper -Value ('{0}:{1}:{2}' -f $username, $first.params.random, $realmHash)
  $secondPayload = [ordered]@{
    method = 'global.login'
    params = [ordered]@{
      userName = $username
      password = $loginHash
      clientType = 'Web3.0'
      authorityType = $first.params.encryption
    }
    id = 2
    session = $first.session
  }
  $second = Invoke-DahuaJson -Address $Device.address -WebSession $webSession -Payload $secondPayload -Operation 'login verification' -Login

  if (-not $second.result) {
    throw 'The device rejected the username or password.'
  }

  return [pscustomobject]@{
    Address = $Device.address
    WebSession = $webSession
    SessionId = [string]$first.session
    NextId = 10
  }
}

function Invoke-DahuaRpc {
  param(
    [Parameter(Mandatory = $true)]$Session,
    [Parameter(Mandatory = $true)][string]$Method,
    $Params = $null,
    $ObjectId = $null
  )

  $payload = [ordered]@{
    method = $Method
    params = $Params
    id = $Session.NextId
    session = $Session.SessionId
  }
  $Session.NextId++
  if ($null -ne $ObjectId) { $payload['object'] = $ObjectId }

  $response = Invoke-DahuaJson -Address $Session.Address -WebSession $Session.WebSession -Payload $payload -Operation $Method
  if (-not $response.result) {
    $code = if ($response.error -and $response.error.code) { $response.error.code } else { 'unknown' }
    throw "Device RPC request $Method failed (code: $code)."
  }
  return $response
}

function Get-DahuaRecords {
  param(
    [Parameter(Mandatory = $true)]$Device,
    [Parameter(Mandatory = $true)][Management.Automation.PSCredential]$Credential,
    [Parameter(Mandatory = $true)][long]$FromUnix,
    [Parameter(Mandatory = $true)][long]$ToUnix
  )

  $session = Open-DahuaSession -Device $Device -Credential $Credential
  $finderId = $null
  $records = New-Object System.Collections.Generic.List[object]

  try {
    $factory = Invoke-DahuaRpc -Session $session -Method 'RecordFinder.factory.create' -Params @{ name = 'AccessControlCardRec' }
    $finderId = $factory.result

    $condition = [ordered]@{
      CreateTime = @('<>', $FromUnix, $ToUnix)
      Orders = @([ordered]@{ Field = 'CreateTime'; Type = 'Ascent' })
    }
    [void](Invoke-DahuaRpc -Session $session -Method 'RecordFinder.startFind' -Params @{ condition = $condition } -ObjectId $finderId)
    $sizeResponse = Invoke-DahuaRpc -Session $session -Method 'RecordFinder.getQuerySize' -ObjectId $finderId
    $total = [int]$sizeResponse.params.count

    for ($offset = 0; $offset -lt $total; $offset += 100) {
      $count = [Math]::Min(100, $total - $offset)
      $page = Invoke-DahuaRpc -Session $session -Method 'RecordFinder.doSeekFind' -Params @{ count = $count; offset = $offset } -ObjectId $finderId
      foreach ($record in @($page.params.records)) {
        if ($null -ne $record) { $records.Add($record) }
      }
    }
  } finally {
    if ($null -ne $finderId) {
      try { [void](Invoke-DahuaRpc -Session $session -Method 'RecordFinder.stopFind' -ObjectId $finderId) } catch {}
      try { [void](Invoke-DahuaRpc -Session $session -Method 'RecordFinder.destroy' -ObjectId $finderId) } catch {}
    }
    try { [void](Invoke-DahuaRpc -Session $session -Method 'global.logout') } catch {}
  }

  return $records.ToArray()
}

function Get-RecordValue {
  param($Record, [string[]]$Names)

  foreach ($name in $Names) {
    $property = $Record.PSObject.Properties[$name]
    if ($null -ne $property -and $null -ne $property.Value) { return $property.Value }
  }
  return $null
}

function ConvertTo-AttendanceEvent {
  param([Parameter(Mandatory = $true)]$Device, [Parameter(Mandatory = $true)]$Record)

  $created = Get-RecordValue -Record $Record -Names @('CreateTime')
  $deviceUserId = Get-RecordValue -Record $Record -Names @('UserID', 'UserId')
  if ($null -eq $created -or [string]::IsNullOrWhiteSpace([string]$deviceUserId)) { return $null }

  $method = Get-RecordValue -Record $Record -Names @('Method')
  $status = Get-RecordValue -Record $Record -Names @('Status')
  $attendanceState = Get-RecordValue -Record $Record -Names @('AttendanceState')
  $recordId = Get-RecordValue -Record $Record -Names @('RecNo', 'RecordID', 'RecordId')
  $name = [string](Get-RecordValue -Record $Record -Names @('CardName', 'UserName', 'Name'))
  if ($name.Length -gt 160) { $name = $name.Substring(0, 160) }

  $canonical = '{0}|{1}|{2}|{3}|{4}|{5}|{6}' -f `
    $Device.code, [long]$created, [string]$deviceUserId, [string]$method, [string]$status, [string]$attendanceState, [string]$recordId

  $wasSuccessful = $true
  if ($null -ne $status) {
    if ($status -is [bool]) { $wasSuccessful = [bool]$status }
    elseif ([string]$status -match '^(true|false)$') { $wasSuccessful = [Convert]::ToBoolean([string]$status) }
    else { $wasSuccessful = ([int]$status -ne 0) }
  }

  return [ordered]@{
    eventKey = Get-Sha256Lower -Value $canonical
    deviceUserId = ([string]$deviceUserId).Trim()
    personName = if ([string]::IsNullOrWhiteSpace($name)) { $null } else { $name.Trim() }
    occurredAt = [DateTimeOffset]::FromUnixTimeSeconds([long]$created).UtcDateTime.ToString('o')
    verificationMethod = if ($null -eq $method) { $null } else { [int]$method }
    attendanceState = if ($null -eq $attendanceState) { $null } else { [int]$attendanceState }
    wasSuccessful = $wasSuccessful
  }
}

function Send-AttendanceBatch {
  param(
    [Parameter(Mandatory = $true)]$Config,
    [Parameter(Mandatory = $true)][Security.SecureString]$IngestSecret,
    [Parameter(Mandatory = $true)]$Device,
    [Parameter(Mandatory = $true)][object[]]$Events
  )

  $bodyObject = [ordered]@{
    connectorId = $Config.connectorId
    deviceCode = $Device.code
    events = @($Events)
  }
  $body = $bodyObject | ConvertTo-Json -Compress -Depth 12
  $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $message = '{0}.{1}' -f $timestamp, $body
  $key = [Text.Encoding]::UTF8.GetBytes((Get-PlainText -SecureValue $IngestSecret))
  $hmac = New-Object Security.Cryptography.HMACSHA256
  try {
    $hmac.Key = $key
    $signature = ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($message)))).Replace('-', '').ToLowerInvariant()
  } finally {
    $hmac.Dispose()
  }

  $headers = @{
    'x-attendance-timestamp' = [string]$timestamp
    'x-attendance-signature' = $signature
  }
  $uri = $Config.siteUrl.TrimEnd('/') + '/api/attendance/ingest/'
  return Invoke-RestMethod `
    -Uri $uri `
    -Method Post `
    -Headers $headers `
    -ContentType 'application/json; charset=utf-8' `
    -Body ([Text.Encoding]::UTF8.GetBytes($body)) `
    -TimeoutSec 30
}

function Read-Cursors {
  param([string]$StatePath)

  $cursors = @{}
  if (-not (Test-Path -LiteralPath $StatePath)) { return $cursors }

  try {
    $state = Get-Content -LiteralPath $StatePath -Raw -Encoding utf8 | ConvertFrom-Json
    if ($state.cursors) {
      foreach ($property in $state.cursors.PSObject.Properties) {
        $cursors[$property.Name] = [long]$property.Value
      }
    }
  } catch {
    Write-ConnectorLog -Level 'WARN' -Message 'Could not read the previous cursor; using the safe initial lookback.'
  }
  return $cursors
}

function Save-Cursors {
  param([string]$StatePath, [hashtable]$Cursors)

  $payload = [ordered]@{ cursors = $Cursors; updatedAt = [DateTime]::UtcNow.ToString('o') }
  $temporaryPath = $StatePath + '.tmp'
  $payload | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temporaryPath -Encoding utf8
  Move-Item -LiteralPath $temporaryPath -Destination $StatePath -Force
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Configuration is missing. Run setup.ps1 first: $ConfigPath"
}

$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding utf8 | ConvertFrom-Json
$runtimeDirectory = Split-Path -Parent $ConfigPath
$statePath = Join-Path $runtimeDirectory 'state.json'
$secretCredentialPath = Join-Path $runtimeDirectory $config.ingestCredentialFile
$secretCredential = Import-Clixml -LiteralPath $secretCredentialPath
$cursors = Read-Cursors -StatePath $statePath
$pollSeconds = [Math]::Max(15, [int]$config.pollIntervalSeconds)
$overlapSeconds = [Math]::Max(60, [int]$config.overlapSeconds)
$initialLookbackSeconds = [Math]::Max(3600, [int]$config.initialLookbackHours * 3600)

Write-ConnectorLog -Message ('Connector {0} started for {1} devices.' -f $config.connectorId, @($config.devices).Count)

do {
  foreach ($device in @($config.devices)) {
    try {
      $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
      $fromUnix = if ($cursors.ContainsKey([string]$device.code)) {
        [Math]::Max(0, [long]$cursors[[string]$device.code] - $overlapSeconds)
      } else {
        [Math]::Max(0, $now - $initialLookbackSeconds)
      }
      $credentialPath = Join-Path $runtimeDirectory $device.credentialFile
      $credential = Import-Clixml -LiteralPath $credentialPath
      $records = $null
      for ($attempt = 1; $attempt -le 2; $attempt++) {
        try {
          $records = @(Get-DahuaRecords -Device $device -Credential $credential -FromUnix $fromUnix -ToUnix ($now + 60))
          break
        } catch {
          if ($attempt -eq 2) { throw }
          Write-ConnectorLog -Level 'WARN' -Message ('{0}: first read attempt failed ({1}); retrying once.' -f $device.name, $_.Exception.Message)
          Start-Sleep -Seconds 2
        }
      }
      $events = @($records | ForEach-Object { ConvertTo-AttendanceEvent -Device $device -Record $_ } | Where-Object { $null -ne $_ })
      $response = Send-AttendanceBatch -Config $config -IngestSecret $secretCredential.Password -Device $device -Events $events

      if (-not $response.ok) { throw 'The website did not acknowledge the batch.' }
      $cursors[[string]$device.code] = $now
      Save-Cursors -StatePath $statePath -Cursors $cursors
      Write-ConnectorLog -Message ('{0}: uploaded {1} records.' -f $device.name, $events.Count)
    } catch {
      Write-ConnectorLog -Level 'ERROR' -Message ('{0}: {1}' -f $device.name, $_.Exception.Message)
    }
  }

  if (-not $Once) { Start-Sleep -Seconds $pollSeconds }
} while (-not $Once)
