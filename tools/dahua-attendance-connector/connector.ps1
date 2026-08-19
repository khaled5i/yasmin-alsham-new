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

function Get-DahuaUsers {
  param(
    [Parameter(Mandatory = $true)]$Device,
    [Parameter(Mandatory = $true)][Management.Automation.PSCredential]$Credential
  )

  $session = Open-DahuaSession -Device $Device -Credential $Credential
  $findToken = $null
  $users = New-Object System.Collections.Generic.List[object]

  try {
    $start = Invoke-DahuaRpc -Session $session -Method 'AccessUser.startFind' -Params @{ Condition = $null }
    $findToken = $start.params.Token
    $total = [int]$start.params.Total

    for ($offset = 0; $offset -lt $total; $offset += 100) {
      $count = [Math]::Min(100, $total - $offset)
      $page = Invoke-DahuaRpc -Session $session -Method 'AccessUser.doFind' -Params @{
        Token = $findToken
        Offset = $offset
        Count = $count
      }
      foreach ($terminalUser in @($page.params.Info)) {
        if ($null -ne $terminalUser) { $users.Add($terminalUser) }
      }
    }
  } finally {
    if ($null -ne $findToken) {
      try { [void](Invoke-DahuaRpc -Session $session -Method 'AccessUser.stopFind' -Params @{ Token = $findToken }) } catch {}
    }
    try { [void](Invoke-DahuaRpc -Session $session -Method 'global.logout') } catch {}
  }

  return $users.ToArray()
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

function ConvertTo-AttendanceDeviceUser {
  param([Parameter(Mandatory = $true)]$TerminalUser)

  $deviceUserId = [string](Get-RecordValue -Record $TerminalUser -Names @('UserID', 'UserId'))
  if ([string]::IsNullOrWhiteSpace($deviceUserId)) { return $null }

  $displayName = [string](Get-RecordValue -Record $TerminalUser -Names @('UserName', 'Name'))
  $userType = Get-RecordValue -Record $TerminalUser -Names @('UserType')
  $userStatus = Get-RecordValue -Record $TerminalUser -Names @('UserStatus')

  $deviceUserId = $deviceUserId.Trim()
  $displayName = $displayName.Trim()
  if ($deviceUserId.Length -gt 100) { return $null }
  if ($displayName.Length -gt 160) { $displayName = $displayName.Substring(0, 160) }

  return [pscustomobject][ordered]@{
    deviceUserId = $deviceUserId
    displayName = if ([string]::IsNullOrWhiteSpace($displayName)) { $null } else { $displayName }
    userType = if ($null -eq $userType) { $null } else { ([string]$userType).Substring(0, [Math]::Min(80, ([string]$userType).Length)) }
    userStatus = if ($null -eq $userStatus) { $null } else { ([string]$userStatus).Substring(0, [Math]::Min(80, ([string]$userStatus).Length)) }
  }
}

function Send-AttendanceBatch {
  param(
    [Parameter(Mandatory = $true)]$Config,
    [Parameter(Mandatory = $true)][Security.SecureString]$IngestSecret,
    [Parameter(Mandatory = $true)]$Device,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Events,
    [AllowEmptyCollection()][object[]]$Users = @(),
    [switch]$UserSnapshot
  )

  $bodyObject = [ordered]@{
    connectorId = $Config.connectorId
    deviceCode = $Device.code
    events = @($Events)
  }
  if ($UserSnapshot) {
    $bodyObject['userSnapshot'] = $true
    $bodyObject['users'] = @($Users)
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

function Read-UserSyncAt {
  param([string]$StatePath)

  $userSyncAt = @{}
  if (-not (Test-Path -LiteralPath $StatePath)) { return $userSyncAt }

  try {
    $state = Get-Content -LiteralPath $StatePath -Raw -Encoding utf8 | ConvertFrom-Json
    $property = $state.PSObject.Properties['userSyncAt']
    if ($null -ne $property -and $null -ne $property.Value) {
      foreach ($entry in $property.Value.PSObject.Properties) {
        $userSyncAt[$entry.Name] = [long]$entry.Value
      }
    }
  } catch {
    Write-ConnectorLog -Level 'WARN' -Message 'Could not read the previous user-sync time; a full directory sync will be attempted.'
  }
  return $userSyncAt
}

function Read-UserSyncAttemptAt {
  param([string]$StatePath)

  $userSyncAttemptAt = @{}
  if (-not (Test-Path -LiteralPath $StatePath)) { return $userSyncAttemptAt }

  try {
    $state = Get-Content -LiteralPath $StatePath -Raw -Encoding utf8 | ConvertFrom-Json
    $property = $state.PSObject.Properties['userSyncAttemptAt']
    if ($null -ne $property -and $null -ne $property.Value) {
      foreach ($entry in $property.Value.PSObject.Properties) {
        $userSyncAttemptAt[$entry.Name] = [long]$entry.Value
      }
    }
  } catch {
    Write-ConnectorLog -Level 'WARN' -Message 'Could not read the previous user-sync attempt time.'
  }
  return $userSyncAttemptAt
}

function Save-ConnectorState {
  param(
    [string]$StatePath,
    [hashtable]$Cursors,
    [hashtable]$UserSyncAt,
    [hashtable]$UserSyncAttemptAt
  )

  $payload = [ordered]@{
    cursors = $Cursors
    userSyncAt = $UserSyncAt
    userSyncAttemptAt = $UserSyncAttemptAt
    updatedAt = [DateTime]::UtcNow.ToString('o')
  }
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
$userSyncAt = Read-UserSyncAt -StatePath $statePath
$userSyncAttemptAt = Read-UserSyncAttemptAt -StatePath $statePath
$pollSeconds = [Math]::Max(15, [int]$config.pollIntervalSeconds)
$overlapSeconds = [Math]::Max(60, [int]$config.overlapSeconds)
$initialLookbackSeconds = [Math]::Max(3600, [int]$config.initialLookbackHours * 3600)
$userSyncIntervalMinutes = 60
$configuredUserSyncInterval = $config.PSObject.Properties['userSyncIntervalMinutes']
if ($null -ne $configuredUserSyncInterval) {
  $userSyncIntervalMinutes = [Math]::Max(15, [int]$configuredUserSyncInterval.Value)
}
$userSyncIntervalSeconds = $userSyncIntervalMinutes * 60

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
      $users = @()
      $includeUserSnapshot = $false
      $lastUserSyncAttempt = if ($userSyncAttemptAt.ContainsKey([string]$device.code)) { [long]$userSyncAttemptAt[[string]$device.code] } else { 0 }

      if (($now - $lastUserSyncAttempt) -ge $userSyncIntervalSeconds) {
        try {
          $terminalUsers = @(Get-DahuaUsers -Device $device -Credential $credential)
          $users = @($terminalUsers | ForEach-Object { ConvertTo-AttendanceDeviceUser -TerminalUser $_ } | Where-Object { $null -ne $_ })
          $includeUserSnapshot = $true
        } catch {
          Write-ConnectorLog -Level 'WARN' -Message ('{0}: user directory read failed ({1}); attendance events will still be uploaded.' -f $device.name, $_.Exception.Message)
        }
      }

      $sendArguments = @{
        Config = $config
        IngestSecret = $secretCredential.Password
        Device = $device
        Events = $events
        Users = $users
      }
      if ($includeUserSnapshot) { $sendArguments['UserSnapshot'] = $true }
      $response = Send-AttendanceBatch @sendArguments

      if (-not $response.ok) { throw 'The website did not acknowledge the batch.' }
      $cursors[[string]$device.code] = $now
      $userSnapshotAccepted = $response.PSObject.Properties['userSnapshotAccepted']
      if ($includeUserSnapshot) { $userSyncAttemptAt[[string]$device.code] = $now }
      if ($includeUserSnapshot -and $null -ne $userSnapshotAccepted -and $userSnapshotAccepted.Value -eq $true) {
        $userSyncAt[[string]$device.code] = $now
      } elseif ($includeUserSnapshot) {
        Write-ConnectorLog -Level 'WARN' -Message ('{0}: the website accepted attendance events but has not accepted the user directory yet.' -f $device.name)
      }
      Save-ConnectorState -StatePath $statePath -Cursors $cursors -UserSyncAt $userSyncAt -UserSyncAttemptAt $userSyncAttemptAt
      $userCountMessage = if ($includeUserSnapshot -and $null -ne $userSnapshotAccepted -and $userSnapshotAccepted.Value -eq $true) {
        '; synchronized {0} users' -f $users.Count
      } else { '' }
      Write-ConnectorLog -Message ('{0}: uploaded {1} records{2}.' -f $device.name, $events.Count, $userCountMessage)
    } catch {
      Write-ConnectorLog -Level 'ERROR' -Message ('{0}: {1}' -f $device.name, $_.Exception.Message)
    }
  }

  if (-not $Once) { Start-Sleep -Seconds $pollSeconds }
} while (-not $Once)
