$ErrorActionPreference = 'Stop'

$workspacePath = Split-Path -Parent $PSScriptRoot
$androidPath = Join-Path $workspacePath 'android'
$androidStudioJdk = 'C:\Program Files\Android\Android Studio\jbr'
$temporaryBuildPath = Join-Path ([System.IO.Path]::GetTempPath()) 'yasmin-printbridge-build'
$releaseApk = Join-Path $temporaryBuildPath 'outputs\apk\release\printbridge-release.apk'
$downloadDirectory = Join-Path $workspacePath 'public\downloads'
$downloadApk = Join-Path $downloadDirectory 'yasmin-print-bridge.apk'

if (-not (Test-Path -LiteralPath $androidStudioJdk)) {
    throw 'Android Studio JDK was not found. Install Android Studio or update $androidStudioJdk in this script.'
}

$env:JAVA_HOME = $androidStudioJdk
$env:Path = "$androidStudioJdk\bin;$env:Path"

Push-Location $androidPath
try {
    & .\gradlew.bat :printbridge:assembleRelease "-PprintBridgeBuildDir=$temporaryBuildPath"
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $releaseApk)) {
    throw "Release APK was not created at $releaseApk."
}

New-Item -ItemType Directory -Path $downloadDirectory -Force | Out-Null
Copy-Item -LiteralPath $releaseApk -Destination $downloadApk -Force

$apk = Get-Item -LiteralPath $downloadApk
$hash = Get-FileHash -LiteralPath $downloadApk -Algorithm SHA256
Write-Host "APK: $($apk.FullName)"
Write-Host "Bytes: $($apk.Length)"
Write-Host "SHA256: $($hash.Hash)"
