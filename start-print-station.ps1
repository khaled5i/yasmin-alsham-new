# Yasmin Alsham - Silent thermal print station
# Run start-server.ps1 first, set the thermal printer as Windows default,
# then keep this window open while orders are being delivered.

$ErrorActionPreference = "Stop"
$stationUrl = "http://localhost:3001/dashboard/print-station"

Write-Host "Starting Yasmin Alsham tailoring print station..." -ForegroundColor Green

try {
    $serverReady = Test-NetConnection -ComputerName localhost -Port 3001 -InformationLevel Quiet -WarningAction SilentlyContinue
}
catch {
    $serverReady = $false
}

if (-not $serverReady) {
    Write-Host "The website is not running on port 3001." -ForegroundColor Red
    Write-Host "Run start-server.ps1 first, then run this script again." -ForegroundColor Yellow
    Read-Host "Press Enter to close"
    exit 1
}

$browserCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)

$browser = $browserCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $browser) {
    Write-Host "Chrome or Microsoft Edge was not found." -ForegroundColor Red
    Write-Host "Open this URL in a Chromium browser with --kiosk-printing:" -ForegroundColor Yellow
    Write-Host $stationUrl -ForegroundColor Cyan
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host "Opening the station with silent printing enabled..." -ForegroundColor Cyan
Start-Process -FilePath $browser -ArgumentList @(
    "--kiosk-printing",
    "--app=$stationUrl"
)

