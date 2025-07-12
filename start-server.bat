@echo off
title Yasmin Alsham - Development Server
color 0A

echo ========================================
echo    Yasmin Alsham Tailoring Website
echo    Development Server Startup
echo ========================================
echo.

echo [INFO] Starting Yasmin Alsham website...
echo [INFO] Project: Custom Dress Tailoring
echo.

cd /d "%~dp0"
echo [INFO] Working directory: %CD%
echo.

echo [CHECK] Verifying Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo [INFO] Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [OK] Node.js version: %NODE_VERSION%

echo [CHECK] Verifying npm installation...
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not available!
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo [OK] npm version: %NPM_VERSION%
echo.

echo [CHECK] Checking dependencies...
if not exist "node_modules" (
    echo [WARN] Dependencies not found. Installing...
    npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed successfully
) else (
    echo [OK] Dependencies found
)
echo.

echo [CLEAN] Cleaning development cache...
if exist ".next" rmdir /s /q ".next" >nul 2>&1
echo [OK] Cache cleaned
echo.

echo [START] Starting Next.js development server...
echo [INFO] Using stable configuration (without Turbopack)
echo [INFO] Server will automatically find an available port:
echo [INFO]    - Preferred: http://localhost:3000
echo [INFO]    - Fallback: http://localhost:3001 (if 3000 is in use)
echo.
echo [INFO] Press Ctrl+C to stop the server
echo.

npm run dev:safe

echo.
echo [INFO] Server stopped. Thank you for using Yasmin Alsham!
pause
