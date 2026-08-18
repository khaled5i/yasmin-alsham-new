param(
  [string]$TaskName = 'Yasmin Attendance Connector'
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$configPath = Join-Path $PSScriptRoot '.runtime\config.json'
if (-not (Test-Path -LiteralPath $configPath)) {
  throw 'Run setup.ps1 first.'
}

$connectorPath = Join-Path $PSScriptRoot 'connector.ps1'
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -Once' -f $connectorPath
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 1)
$userId = '{0}\{1}' -f $env:USERDOMAIN, $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description 'Reads sanitized attendance events from the two local Dahua terminals and uploads them securely.' `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host 'Automatic sync installed. It will run every minute while this Windows user is signed in.' -ForegroundColor Green
