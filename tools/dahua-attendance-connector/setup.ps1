param(
  [string]$SiteUrl = 'https://www.yasmin-alsham.fashion'
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$runtimeDirectory = Join-Path $PSScriptRoot '.runtime'
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null

function Read-DeviceCredential {
  param([Parameter(Mandatory = $true)][string]$DeviceLabel)

  Write-Host ''
  Write-Host $DeviceLabel -ForegroundColor Cyan
  $username = Read-Host 'Device username (press Enter to use admin)'
  if ([string]::IsNullOrWhiteSpace($username)) { $username = 'admin' }
  $password = Read-Host 'Device password (typing is hidden; press Enter when finished)' -AsSecureString
  return New-Object Management.Automation.PSCredential($username, $password)
}

Write-Host ''
Write-Host 'Yasmin Alsham attendance connector setup' -ForegroundColor Cyan
Write-Host 'Device passwords are not stored in the project or website.' -ForegroundColor DarkGray
Write-Host ''

if ([string]::IsNullOrWhiteSpace($SiteUrl)) {
  $SiteUrl = Read-Host 'Enter the published website URL (example: https://example.com)'
}
$SiteUrl = $SiteUrl.Trim().TrimEnd('/')

$parsedSite = $null
if (-not [Uri]::TryCreate($SiteUrl, [UriKind]::Absolute, [ref]$parsedSite)) {
  throw 'The website URL is invalid.'
}
if ($parsedSite.Scheme -ne 'https' -and $parsedSite.Host -notin @('localhost', '127.0.0.1')) {
  throw 'The published website must use HTTPS.'
}

$useExistingSecret = Read-Host 'Do you already have ATTENDANCE_INGEST_SECRET? Type Y, or press Enter to generate one'
if ($useExistingSecret -match '^(yes|y)$') {
  $secretSecure = Read-Host 'Paste the secret (it will remain hidden)' -AsSecureString
} else {
  $bytes = New-Object byte[] 48
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  $generatedSecret = [Convert]::ToBase64String($bytes)
  $secretSecure = ConvertTo-SecureString -String $generatedSecret -AsPlainText -Force
  try {
    Set-Clipboard -Value $generatedSecret
    Write-Host 'A secret was generated and copied. Add it to hosting as ATTENDANCE_INGEST_SECRET.' -ForegroundColor Yellow
  } catch {
    Write-Host 'Add this secret to hosting as ATTENDANCE_INGEST_SECRET:' -ForegroundColor Yellow
    Write-Host $generatedSecret -ForegroundColor White
  }
  $generatedSecret = $null
}

$secretCredential = New-Object Management.Automation.PSCredential('attendance-connector', $secretSecure)
$secretCredential | Export-Clixml -LiteralPath (Join-Path $runtimeDirectory 'ingest-secret.credential.xml')

Write-Host ''
$entryCredential = Read-DeviceCredential -DeviceLabel 'ENTRY device - 192.168.100.30'
$entryCredential | Export-Clixml -LiteralPath (Join-Path $runtimeDirectory 'entry.credential.xml')

Write-Host ''
$exitCredential = Read-DeviceCredential -DeviceLabel 'EXIT device - 192.168.100.29'
$exitCredential | Export-Clixml -LiteralPath (Join-Path $runtimeDirectory 'exit.credential.xml')

$machineSlug = ($env:COMPUTERNAME.ToLowerInvariant() -replace '[^a-z0-9_-]', '-')
$config = [ordered]@{
  siteUrl = $SiteUrl
  connectorId = "yasmin-$machineSlug"
  pollIntervalSeconds = 30
  overlapSeconds = 120
  initialLookbackHours = 72
  userSyncIntervalMinutes = 60
  ingestCredentialFile = 'ingest-secret.credential.xml'
  devices = @(
    [ordered]@{
      code = 'workshop-entry'
      name = 'Entry device'
      address = 'https://192.168.100.30'
      credentialFile = 'entry.credential.xml'
    },
    [ordered]@{
      code = 'workshop-exit'
      name = 'Exit device'
      address = 'https://192.168.100.29'
      credentialFile = 'exit.credential.xml'
    }
  )
}

$config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runtimeDirectory 'config.json') -Encoding utf8

Write-Host ''
Write-Host 'Setup saved. Credentials are encrypted for the current Windows user.' -ForegroundColor Green
Write-Host 'After deployment and adding the secret, run test-connector.ps1.' -ForegroundColor White
