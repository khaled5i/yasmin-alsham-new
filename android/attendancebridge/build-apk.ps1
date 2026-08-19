Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$moduleDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$androidDirectory = Split-Path -Parent $moduleDirectory
$studioJdk = 'C:\Program Files\Android\Android Studio\jbr'

if (-not (Test-Path -LiteralPath (Join-Path $studioJdk 'bin\java.exe'))) {
  throw 'Android Studio Java runtime was not found. Install Android Studio with its bundled JDK.'
}

$env:JAVA_HOME = $studioJdk
$env:Path = (Join-Path $studioJdk 'bin') + ';' + $env:Path

Push-Location $androidDirectory
try {
  & '.\gradlew.bat' ':attendancebridge:assembleRelease'
  if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$apkPath = Join-Path $moduleDirectory 'build\outputs\apk\release\attendancebridge-release.apk'
if (-not (Test-Path -LiteralPath $apkPath)) {
  throw "Build completed but the APK was not found at $apkPath"
}

Write-Host ''
Write-Host 'Attendance APK is ready:' -ForegroundColor Green
Write-Host $apkPath -ForegroundColor White
