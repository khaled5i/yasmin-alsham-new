# Yasmin Alsham - Simple GitHub Deployment Script
# Simple PowerShell script to deploy updates to GitHub

param(
    [string]$Message = ""
)

# Colors
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"
$Blue = "Blue"
$Cyan = "Cyan"

function Write-Color {
    param([string]$Text, [string]$Color = "White")
    Write-Host $Text -ForegroundColor $Color
}

# Header
Write-Host ""
Write-Color "========================================" $Cyan
Write-Color "   Yasmin Alsham - Deploy to GitHub" $Cyan
Write-Color "========================================" $Cyan
Write-Host ""

# Check Git
try {
    $gitVersion = git --version 2>$null
    if (-not $gitVersion) {
        Write-Color "❌ Git is not installed" $Red
        Write-Color "Please install Git from: https://git-scm.com/" $Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Color "✅ Git found: $gitVersion" $Green
}
catch {
    Write-Color "❌ Git is not installed" $Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if Git repository
try {
    git status --porcelain 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Color "❌ This folder is not a Git repository" $Red
        Write-Color "Please run: git init" $Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Color "✅ Valid Git repository" $Green
}
catch {
    Write-Color "❌ This folder is not a Git repository" $Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Show status
Write-Color "📋 Current file status:" $Blue
$status = git status --short
if ($status) {
    $status | ForEach-Object {
        if ($_ -match "^\s*M\s") { Write-Color $_ $Yellow }
        elseif ($_ -match "^\s*A\s") { Write-Color $_ $Green }
        elseif ($_ -match "^\s*D\s") { Write-Color $_ $Red }
        elseif ($_ -match "^\?\?\s") { Write-Color $_ $Cyan }
        else { Write-Host $_ }
    }
}
else {
    Write-Color "No changes" $Green
}

Write-Host ""

# Check for changes
git diff-index --quiet HEAD -- 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Color "ℹ️ No changes to commit" $Yellow
    $choice = Read-Host "Continue anyway? (y/n)"
    if ($choice -ne "y" -and $choice -ne "Y") {
        Write-Color "Cancelled" $Yellow
        Read-Host "Press Enter to exit"
        exit 0
    }
}

# Get commit message
if ([string]::IsNullOrWhiteSpace($Message)) {
    $defaultMessage = "Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    $Message = Read-Host "Enter commit message (or press Enter for default: $defaultMessage)"
    if ([string]::IsNullOrWhiteSpace($Message)) {
        $Message = $defaultMessage
    }
}

Write-Host ""
Write-Color "🚀 Starting deployment..." $Blue
Write-Host ""

# Add files
Write-Color "➕ Adding files..." $Blue
try {
    git add .
    if ($LASTEXITCODE -eq 0) {
        Write-Color "✅ Files added successfully" $Green
    }
    else {
        Write-Color "❌ Error adding files" $Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}
catch {
    Write-Color "❌ Error adding files" $Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Create commit
Write-Color "💾 Creating commit..." $Blue
try {
    git commit -m $Message
    if ($LASTEXITCODE -eq 0) {
        Write-Color "✅ Commit created successfully" $Green
    }
    else {
        Write-Color "❌ Error creating commit" $Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}
catch {
    Write-Color "❌ Error creating commit" $Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check remote origin
try {
    $remoteUrl = git remote get-url origin 2>$null
    if (-not $remoteUrl -or $LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Color "⚠️ No remote origin configured" $Yellow
        $repoUrl = Read-Host "Enter repository URL (e.g., https://github.com/username/repo.git)"
        
        if ([string]::IsNullOrWhiteSpace($repoUrl)) {
            Write-Color "❌ Repository URL not provided" $Red
            Read-Host "Press Enter to exit"
            exit 1
        }
        
        Write-Color "➕ Adding remote origin..." $Blue
        git remote add origin $repoUrl
        if ($LASTEXITCODE -ne 0) {
            Write-Color "❌ Error adding remote origin" $Red
            Read-Host "Press Enter to exit"
            exit 1
        }
        Write-Color "✅ Remote origin added successfully" $Green
    }
    else {
        Write-Color "✅ Remote origin found: $remoteUrl" $Green
    }
}
catch {
    Write-Color "❌ Error checking remote origin" $Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Push to GitHub
Write-Host ""
Write-Color "📤 Pushing updates to GitHub..." $Blue

$currentBranch = git branch --show-current 2>$null
if (-not $currentBranch) {
    $currentBranch = "master"
}

Write-Color "🌿 Current branch: $currentBranch" $Cyan

try {
    git push -u origin $currentBranch
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Color "========================================" $Green
        Write-Color "🎉 Updates deployed successfully!" $Green
        Write-Color "========================================" $Green
        Write-Host ""
        
        Write-Color "📊 Operation details:" $Blue
        Write-Color "   📝 Commit message: $Message" "White"
        Write-Color "   🌿 Branch: $currentBranch" "White"
        Write-Color "   🔗 Repository: $remoteUrl" "White"
        Write-Host ""
        
        Write-Color "📋 Recent commits:" $Blue
        git log --oneline -5
        Write-Host ""
        
        Write-Color "✅ Operation complete! You can now review the updates on GitHub" $Green
        
        # Open GitHub (optional)
        $choice = Read-Host "🌐 Open GitHub in browser? (y/n)"
        if ($choice -eq "y" -or $choice -eq "Y") {
            try {
                if ($remoteUrl -match "git@github.com:(.+)\.git") {
                    $remoteUrl = "https://github.com/$($Matches[1])"
                }
                Start-Process $remoteUrl
            }
            catch {
                Write-Color "❌ Error opening browser" $Red
            }
        }
    }
    else {
        Write-Host ""
        Write-Color "❌ Error pushing updates" $Red
        Write-Color "💡 Troubleshooting tips:" $Yellow
        Write-Color "   1. Check your login credentials" $Yellow
        Write-Color "   2. Ensure you have write permissions" $Yellow
        Write-Color "   3. Check your internet connection" $Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
}
catch {
    Write-Color "❌ Error pushing updates" $Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Color "Thank you for using Yasmin Alsham!" $Cyan
Read-Host "Press Enter to exit"
