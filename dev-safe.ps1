# Yasmin Alsham - Safe Development Server Startup Script
# This script handles common Turbopack and Next.js development issues

Write-Host "🚀 Starting Yasmin Alsham Development Server..." -ForegroundColor Green
Write-Host "📍 Project: Yasmin Alsham Tailoring Website" -ForegroundColor Cyan

# Step 1: Clean all cache and build artifacts
Write-Host "`n🧹 Cleaning cache and build artifacts..." -ForegroundColor Yellow
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .turbo -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force out -ErrorAction SilentlyContinue
Write-Host "✅ Cache cleaned successfully" -ForegroundColor Green

# Step 2: Verify Node.js and npm versions
Write-Host "`n🔍 Checking environment..." -ForegroundColor Yellow
Write-Host "Node.js version: $(node --version)" -ForegroundColor Cyan
Write-Host "npm version: $(npm --version)" -ForegroundColor Cyan

# Step 3: Check for dependency issues
Write-Host "`n📦 Verifying dependencies..." -ForegroundColor Yellow
$npmAudit = npm audit --audit-level=high 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Dependency vulnerabilities found, but continuing..." -ForegroundColor Yellow
} else {
    Write-Host "✅ Dependencies verified" -ForegroundColor Green
}

# Step 4: Start development server with error handling
Write-Host "`n🌟 Starting Next.js development server with Turbopack..." -ForegroundColor Yellow
Write-Host "📱 The server will be available at:" -ForegroundColor Cyan
Write-Host "   - Local: http://localhost:3000" -ForegroundColor White
Write-Host "   - Network: Check terminal output for network address" -ForegroundColor White
Write-Host "`n💡 Press Ctrl+C to stop the server" -ForegroundColor Magenta
Write-Host "🔄 If you encounter Turbopack errors, run this script again" -ForegroundColor Magenta

# Try to start the server
try {
    npm run dev
} catch {
    Write-Host "`n❌ Error starting development server!" -ForegroundColor Red
    Write-Host "🔧 Trying alternative startup method..." -ForegroundColor Yellow
    
    # Alternative: Start without Turbopack if there are issues
    Write-Host "🔄 Starting without Turbopack..." -ForegroundColor Yellow
    npx next dev
}
