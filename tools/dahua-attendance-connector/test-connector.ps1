$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Write-Host 'Testing both devices and uploading one batch...' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'connector.ps1') -Once

$logPath = Join-Path $PSScriptRoot '.runtime\connector.log'
Write-Host ''
Write-Host 'Test completed. Latest results:' -ForegroundColor Cyan
if (Test-Path -LiteralPath $logPath) {
  Get-Content -LiteralPath $logPath -Encoding utf8 -Tail 8
}
