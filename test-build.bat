@echo off
chcp 65001 >nul
echo.
echo ========================================
echo    Test Local Build for Vercel
echo ========================================
echo.

:: Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Error: package.json not found
    pause
    exit /b 1
)

echo ✅ Found package.json
echo.

:: Clean previous builds
echo 🧹 Cleaning previous builds...
if exist ".next" rmdir /s /q ".next"
if exist "node_modules\.cache" rmdir /s /q "node_modules\.cache"
echo ✅ Cleaned build directories
echo.

:: Install dependencies
echo 📦 Installing dependencies...
npm install
if errorlevel 1 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)
echo ✅ Dependencies installed
echo.

:: Run build
echo 🔨 Running build...
npm run build
if errorlevel 1 (
    echo ❌ Build failed
    echo.
    echo 💡 Common build issues:
    echo    - TypeScript errors
    echo    - Missing environment variables
    echo    - Import/export issues
    echo    - Supabase connection issues
    echo.
    pause
    exit /b 1
)

echo ✅ Build completed successfully!
echo.

:: Check build output
echo 📁 Checking build output...
if exist ".next\standalone" (
    echo ✅ Standalone build found
) else (
    echo ⚠️  No standalone build found
)

if exist ".next\static" (
    echo ✅ Static files found
) else (
    echo ❌ No static files found
)

if exist ".next\server" (
    echo ✅ Server files found
) else (
    echo ❌ No server files found
)

echo.
echo ========================================
echo 🎯 Build Test Complete!
echo ========================================
echo.
echo If the build succeeded locally, the issue is with Vercel configuration.
echo If the build failed, fix the local issues first.
echo.
pause
