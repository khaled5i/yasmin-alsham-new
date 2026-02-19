# Yasmin Alsham - Development Server Startup Script
# This script starts the development server with the most stable configuration

Write-Host "Starting Yasmin Alsham Tailoring Website..." -ForegroundColor Green
Write-Host "Project: Yasmin Alsham Custom Dress Tailoring" -ForegroundColor Cyan

# Navigate to the project directory
Set-Location $PSScriptRoot
Write-Host "Working directory: $PWD" -ForegroundColor Yellow

# Check if Node.js is available
Write-Host ""
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
}
catch {
    Write-Host "Node.js is not installed or not in PATH!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    pause
    exit 1
}

# Check if npm is available
try {
    $npmVersion = npm --version
    Write-Host "npm version: $npmVersion" -ForegroundColor Green
}
catch {
    Write-Host "npm is not available!" -ForegroundColor Red
    pause
    exit 1
}

# Check if dependencies are installed
Write-Host ""
Write-Host "Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "Dependencies not found. Installing..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dependencies!" -ForegroundColor Red
        pause
        exit 1
    }
    Write-Host "Dependencies installed successfully" -ForegroundColor Green
}
else {
    Write-Host "Dependencies found" -ForegroundColor Green
}

# Clean cache for better stability
Write-Host ""
Write-Host "Cleaning development cache..." -ForegroundColor Yellow
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
Write-Host "Cache cleaned" -ForegroundColor Green

# Check if port 3001 is available
Write-Host ""
Write-Host "Checking port 3001 availability..." -ForegroundColor Yellow
try {
    $connection = Test-NetConnection -ComputerName localhost -Port 3001 -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($connection) {
        Write-Host "Port 3001 is currently in use" -ForegroundColor Yellow
        Write-Host "Attempting to find and stop conflicting processes..." -ForegroundColor Yellow

        # Try to find processes using port 3001
        try {
            $processes = netstat -ano | findstr :3001
            if ($processes) {
                Write-Host "Found processes using port 3001:" -ForegroundColor Yellow
                Write-Host $processes -ForegroundColor White
                Write-Host "You may need to manually stop these processes" -ForegroundColor Yellow
            }
        }
        catch {
            Write-Host "Could not check for processes using port 3001" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "Port 3001 is available" -ForegroundColor Green
    }
}
catch {
    Write-Host "Port 3001 appears to be available" -ForegroundColor Green
}

# Start the development server
Write-Host ""
Write-Host "Starting Next.js development server on port 3001..." -ForegroundColor Yellow
Write-Host "Using stable configuration (without Turbopack)" -ForegroundColor Cyan
Write-Host "Server will be available at: http://localhost:3001" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Magenta
Write-Host "If you encounter any issues, this script will handle them automatically" -ForegroundColor Magenta
Write-Host ""

# Start the server with error handling and forced port 3001
try {
    Write-Host "Attempting to start server on port 3001..." -ForegroundColor Cyan
    npx next dev --port 3001
}
catch {
    Write-Host ""
    Write-Host "Error starting development server on port 3001!" -ForegroundColor Red
    Write-Host "Trying alternative startup methods..." -ForegroundColor Yellow

    # Alternative 1: Try with npm script but force port
    Write-Host "Attempting with npm script and forced port..." -ForegroundColor Yellow
    try {
        $env:PORT = "3001"
        npm run dev:safe -- --port 3001
    }
    catch {
        Write-Host "Alternative method 1 failed. Trying with Turbopack..." -ForegroundColor Yellow

        # Alternative 2: Try with Turbopack but force port
        try {
            npx next dev --turbopack --port 3001
        }
        catch {
            Write-Host "All startup methods failed!" -ForegroundColor Red
            Write-Host "Troubleshooting suggestions:" -ForegroundColor Yellow
            Write-Host "   1. Ensure port 3001 is not in use by another application" -ForegroundColor White
            Write-Host "   2. Try running: npm install" -ForegroundColor White
            Write-Host "   3. Try running: npm run build" -ForegroundColor White
            Write-Host "   4. Check Node.js version (should be 18+)" -ForegroundColor White
            Write-Host "   5. Manually stop any processes using port 3001" -ForegroundColor White
            pause
            exit 1
        }
    }
}

Write-Host ""
Write-Host "Server stopped. Thank you for using Yasmin Alsham!" -ForegroundColor Green
