# Yasmin Alsham - Switch from master to main branch
# PowerShell script to convert repository from master to main branch

# Colors for output
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"
$Blue = "Blue"
$Cyan = "Cyan"

function Write-Color {
    param([string]$Text, [string]$Color = "White")
    Write-Host $Text -ForegroundColor $Color
}

# Display header
Write-Host ""
Write-Color "========================================" $Cyan
Write-Color "   Switch from master to main branch" $Cyan
Write-Color "========================================" $Cyan
Write-Host ""

# Check if Git is installed
try {
    $gitVersion = git --version 2>$null
    if (-not $gitVersion) {
        Write-Color "Error: Git is not installed" $Red
        Write-Color "Please install Git from: https://git-scm.com/" $Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Color "Git found: $gitVersion" $Green
}
catch {
    Write-Color "Error: Git is not installed" $Red
    Write-Color "Please install Git from: https://git-scm.com/" $Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Check current branch
try {
    $currentBranch = git branch --show-current 2>$null
    Write-Color "Current branch: $currentBranch" $Blue
    
    if ($currentBranch -eq "main") {
        Write-Color "You are already on main branch" $Green
        Read-Host "Press Enter to exit"
        exit 0
    }
    
    if ($currentBranch -ne "master") {
        Write-Color "Warning: You are not on master branch" $Yellow
        $choice = Read-Host "Continue anyway? (y/n)"
        if ($choice -ne "y" -and $choice -ne "Y") {
            Write-Color "Operation cancelled" $Yellow
            Read-Host "Press Enter to exit"
            exit 0
        }
    }
}
catch {
    Write-Color "Error checking current branch" $Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Color "Starting conversion process..." $Blue
Write-Host ""

# Check for uncommitted changes
try {
    $statusOutput = git status --porcelain 2>$null
    if ($statusOutput) {
        Write-Color "Warning: There are uncommitted changes" $Yellow
        Write-Host ""
        git status --short
        Write-Host ""
        
        $choice = Read-Host "Save changes first? (y/n)"
        if ($choice -eq "y" -or $choice -eq "Y") {
            Write-Color "Saving changes..." $Blue
            git add .
            git commit -m "Save changes before switching to main branch"
            if ($LASTEXITCODE -ne 0) {
                Write-Color "Failed to save changes" $Red
                Read-Host "Press Enter to exit"
                exit 1
            }
            Write-Color "Changes saved successfully" $Green
        }
        else {
            Write-Color "Warning: Uncommitted changes will be lost" $Yellow
            $confirm = Read-Host "Are you sure? (y/n)"
            if ($confirm -ne "y" -and $confirm -ne "Y") {
                Write-Color "Operation cancelled" $Yellow
                Read-Host "Press Enter to exit"
                exit 0
            }
        }
    }
}
catch {
    Write-Color "Error checking repository status" $Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Create main branch from master
Write-Color "Creating main branch..." $Blue
try {
    git checkout -b main
    if ($LASTEXITCODE -ne 0) {
        Write-Color "Failed to create main branch" $Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Color "Main branch created successfully" $Green
}
catch {
    Write-Color "Error creating main branch" $Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Push main branch to GitHub
Write-Color "Pushing main branch to GitHub..." $Blue
try {
    git push -u origin main
    if ($LASTEXITCODE -eq 0) {
        Write-Color "Main branch pushed successfully" $Green
    }
    else {
        Write-Color "Failed to push main branch" $Red
        Write-Host ""
        Write-Color "Troubleshooting tips:" $Yellow
        Write-Color "1. Check internet connection" $Yellow
        Write-Color "2. Check GitHub permissions" $Yellow
        Write-Color "3. Verify repository URL" $Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
}
catch {
    Write-Color "Error pushing main branch" $Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Show additional steps required
Write-Color "Additional steps required:" $Blue
Write-Host ""
Write-Color "Please change the default branch on GitHub:" $Yellow
Write-Host ""
Write-Color "1. Go to: Settings → Branches" "White"
Write-Color "2. Change Default branch from master to main" "White"
Write-Color "3. Delete old master branch (optional)" "White"
Write-Host ""

# Show final status
Write-Color "Final repository status:" $Blue
Write-Host ""
git branch -a
Write-Host ""

# Success message
Write-Color "========================================" $Green
Write-Color "Successfully switched to main branch!" $Green
Write-Color "========================================" $Green
Write-Host ""

Write-Color "Now all deployment scripts will use main branch" $Green
Write-Host ""

# Offer to open GitHub
$openGitHub = Read-Host "Open GitHub to change default branch? (y/n)"
if ($openGitHub -eq "y" -or $openGitHub -eq "Y") {
    try {
        $remoteUrl = git remote get-url origin 2>$null
        if ($remoteUrl) {
            # Convert SSH URL to HTTPS if needed
            if ($remoteUrl -match "git@github.com:(.+)\.git") {
                $remoteUrl = "https://github.com/$($Matches[1])"
            }
            # Remove .git suffix if present
            $remoteUrl = $remoteUrl -replace "\.git$", ""
            $settingsUrl = "$remoteUrl/settings/branches"
            Start-Process $settingsUrl
            Write-Color "Opening GitHub settings..." $Cyan
        }
    }
    catch {
        Write-Color "Could not open browser" $Red
    }
}

Write-Host ""
Write-Color "Thank you for using Yasmin Alsham!" $Cyan
Read-Host "Press Enter to exit"
