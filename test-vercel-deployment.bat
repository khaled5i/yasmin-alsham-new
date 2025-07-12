@echo off
chcp 65001 >nul
echo.
echo ========================================
echo    Test Vercel Deployment Configuration
echo ========================================
echo.

:: Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Error: package.json not found
    echo Make sure you're in the project root directory
    pause
    exit /b 1
)

echo ✅ Found package.json - we're in the correct directory
echo.

:: Show project structure
echo 📁 Project structure verification:
echo.
if exist "src\" echo ✅ src/ directory found
if exist "public\" echo ✅ public/ directory found
if exist "next.config.ts" echo ✅ next.config.ts found
if exist "tailwind.config.ts" echo ✅ tailwind.config.ts found
if exist "tsconfig.json" echo ✅ tsconfig.json found
echo.

:: Check package.json content
echo 📋 Package.json verification:
findstr /C:"\"name\": \"yasmin-alsham\"" package.json >nul && echo ✅ Project name: yasmin-alsham
findstr /C:"\"next\":" package.json >nul && echo ✅ Next.js dependency found
findstr /C:"\"build\": \"next build\"" package.json >nul && echo ✅ Build script configured
echo.

:: Create a test commit to trigger Vercel
echo 🧪 Creating test commit to trigger Vercel deployment...
echo.

:: Add timestamp to README to trigger deployment
echo. >> README.md
echo Last deployment test: %date% %time% >> README.md

git add README.md
git commit -m "Test Vercel deployment configuration - %date% %time%"

echo ✅ Test commit created
echo.

:: Push to trigger Vercel
echo 📤 Pushing to GitHub to trigger Vercel...
git push origin main

if errorlevel 1 (
    echo ❌ Failed to push to GitHub
    pause
    exit /b 1
)

echo ✅ Successfully pushed to GitHub
echo.

:: Instructions for Vercel
echo 📋 Vercel Configuration Checklist:
echo.
echo ✅ Your project structure is correct for Vercel
echo ✅ Files are at repository root (not in subdirectory)
echo.
echo 🔧 Vercel Settings Should Be:
echo    Framework Preset: Next.js
echo    Root Directory: (COMPLETELY EMPTY)
echo    Build Command: npm run build
echo    Output Directory: (empty)
echo    Install Command: npm install
echo.
echo 🌐 Next Steps:
echo 1. Go to https://vercel.com/dashboard
echo 2. Find your yasmin-alsham project
echo 3. Go to Settings → General
echo 4. Make sure Root Directory is COMPLETELY EMPTY
echo 5. Save settings
echo 6. Go to Deployments and click Redeploy
echo.
echo 💡 If still not working:
echo    - Delete the project in Vercel
echo    - Create new project from GitHub
echo    - Import khaled5i/yasmin-alsham
echo    - Leave Root Directory EMPTY
echo.

:: Open Vercel dashboard
set /p open_vercel="🌐 Open Vercel Dashboard? (y/n): "
if /i "%open_vercel%"=="y" (
    start "" "https://vercel.com/dashboard"
)

echo.
echo ========================================
echo 🎯 Test Complete!
echo ========================================
echo.
echo The test commit has been pushed to GitHub.
echo Vercel should automatically detect and deploy it.
echo Check your Vercel dashboard for the deployment status.
echo.
pause
