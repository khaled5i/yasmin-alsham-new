# Yasmin Alsham - GitHub Deployment Script
# Fixed PowerShell script to deploy updates to GitHub

param(
    [string]$Message = "",
    [switch]$Quick = $false
)

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
Write-Color "   Yasmin Alsham - Deploy to GitHub" $Cyan
Write-Color "========================================" $Cyan
Write-Host ""

# Check if Git is installed
try {
    $gitVersion = git --version 2>$null
    if (-not $gitVersion) {
        Write-Color "Error: Git is not installed" $Red
        Write-Color "Please install Git from: https://git-scm.com/" $Yellow
        if (-not $Quick) { Read-Host "Press Enter to exit" }
        exit 1
    }
    Write-Color "Git found: $gitVersion" $Green
}
catch {
    Write-Color "Error: Git is not installed" $Red
    Write-Color "Please install Git from: https://git-scm.com/" $Yellow
    if (-not $Quick) { Read-Host "Press Enter to exit" }
    exit 1
}

Write-Host ""

# Check if this is a Git repository
try {
    git status --porcelain 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Color "Error: This folder is not a Git repository" $Red
        Write-Color "Please run: git init" $Yellow
        if (-not $Quick) { Read-Host "Press Enter to exit" }
        exit 1
    }
    Write-Color "Valid Git repository found" $Green
}
catch {
    Write-Color "Error: This folder is not a Git repository" $Red
    Write-Color "Please run: git init" $Yellow
    if (-not $Quick) { Read-Host "Press Enter to exit" }
    exit 1
}

Write-Host ""

# Show current file status
Write-Color "Current file status:" $Blue
Write-Host ""
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
    Write-Color "No changes detected" $Green
}

Write-Host ""

# Check if there are changes to commit
git diff-index --quiet HEAD -- 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Color "No changes to commit" $Yellow
    if (-not $Quick) {
        $choice = Read-Host "Continue anyway? (y/n)"
        if ($choice -ne "y" -and $choice -ne "Y") {
            Write-Color "Operation cancelled" $Yellow
            Read-Host "Press Enter to exit"
            exit 0
        }
    }
}

# Get commit message
if ([string]::IsNullOrWhiteSpace($Message)) {
    if ($Quick) {
        $Message = "Quick update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    }
    else {
        $defaultMessage = "Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
        Write-Host "Enter commit message (or press Enter for default):"
        Write-Color "Default: $defaultMessage" $Yellow
        $userInput = Read-Host "Message"
        if ([string]::IsNullOrWhiteSpace($userInput)) {
            $Message = $defaultMessage
        }
        else {
            $Message = $userInput
        }
    }
}

Write-Host ""
Write-Color "Starting deployment process..." $Blue
Write-Color "Commit message: $Message" $Cyan
Write-Host ""

# Add all files
Write-Color "Adding files to Git..." $Blue
try {
    git add .
    if ($LASTEXITCODE -eq 0) {
        Write-Color "Files added successfully" $Green
    }
    else {
        Write-Color "Error adding files" $Red
        if (-not $Quick) { Read-Host "Press Enter to exit" }
        exit 1
    }
}
catch {
    Write-Color "Error adding files" $Red
    if (-not $Quick) { Read-Host "Press Enter to exit" }
    exit 1
}

# Create commit
Write-Color "Creating commit..." $Blue
try {
    git commit -m $Message
    if ($LASTEXITCODE -eq 0) {
        Write-Color "Commit created successfully" $Green
    }
    else {
        Write-Color "Error creating commit" $Red
        if (-not $Quick) { Read-Host "Press Enter to exit" }
        exit 1
    }
}
catch {
    Write-Color "Error creating commit" $Red
    if (-not $Quick) { Read-Host "Press Enter to exit" }
    exit 1
}

# Check for remote origin
try {
    $remoteUrl = git remote get-url origin 2>$null
    if (-not $remoteUrl -or $LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Color "Warning: No remote origin configured" $Yellow
        if (-not $Quick) {
            $repoUrl = Read-Host "Enter repository URL (e.g., https://github.com/username/repo.git)"
            
            if ([string]::IsNullOrWhiteSpace($repoUrl)) {
                Write-Color "Repository URL not provided" $Red
                Read-Host "Press Enter to exit"
                exit 1
            }
            
            Write-Color "Adding remote origin..." $Blue
            git remote add origin $repoUrl
            if ($LASTEXITCODE -ne 0) {
                Write-Color "Error adding remote origin" $Red
                Read-Host "Press Enter to exit"
                exit 1
            }
            Write-Color "Remote origin added successfully" $Green
            $remoteUrl = $repoUrl
        }
        else {
            Write-Color "No remote origin configured. Please run without -Quick flag first." $Red
            exit 1
        }
    }
    else {
        Write-Color "Remote origin: $remoteUrl" $Green
    }
}
catch {
    Write-Color "Error checking remote origin" $Red
    if (-not $Quick) { Read-Host "Press Enter to exit" }
    exit 1
}

# Get current branch
$currentBranch = git branch --show-current 2>$null
if (-not $currentBranch) {
    $currentBranch = "master"
}

# Push to GitHub
Write-Host ""
Write-Color "Pushing updates to GitHub..." $Blue
Write-Color "Branch: $currentBranch" $Cyan

try {
    git push -u origin $currentBranch
    if ($LASTEXITCODE -eq 0) {
        # Success!
        Write-Host ""
        Write-Color "========================================" $Green
        Write-Color "Updates deployed successfully!" $Green
        Write-Color "========================================" $Green
        Write-Host ""
        
        # Show operation details
        Write-Color "Operation Summary:" $Blue
        Write-Color "Commit: $Message" "White"
        Write-Color "Branch: $currentBranch" "White"
        Write-Color "Repository: $remoteUrl" "White"
        Write-Host ""
        
        # Show recent commits
        Write-Color "Recent commits:" $Blue
        git log --oneline -5
        Write-Host ""
        
        Write-Color "Deployment complete! Check your repository on GitHub." $Green
        
        # Offer to open GitHub
        if (-not $Quick) {
            $openBrowser = Read-Host "Open GitHub in browser? (y/n)"
            if ($openBrowser -eq "y" -or $openBrowser -eq "Y") {
                try {
                    # Convert SSH URL to HTTPS if needed
                    if ($remoteUrl -match "git@github.com:(.+)\.git") {
                        $remoteUrl = "https://github.com/$($Matches[1])"
                    }
                    Start-Process $remoteUrl
                    Write-Color "Opening GitHub..." $Cyan
                }
                catch {
                    Write-Color "Could not open browser" $Red
                }
            }
        }
    }
    else {
        Write-Host ""
        Write-Color "Failed to push updates" $Red
        Write-Host ""
        Write-Color "Troubleshooting tips:" $Yellow
        Write-Color "1. Check your GitHub credentials" $Yellow
        Write-Color "2. Verify repository permissions" $Yellow
        Write-Color "3. Check internet connection" $Yellow
        Write-Color "4. Try: git push origin $currentBranch --force" $Yellow
        if (-not $Quick) { Read-Host "Press Enter to exit" }
        exit 1
    }
}
catch {
    Write-Color "Error during push operation" $Red
    if (-not $Quick) { Read-Host "Press Enter to exit" }
    exit 1
}

Write-Host ""
Write-Color "Thank you for using Yasmin Alsham deployment script!" $Cyan
if (-not $Quick) {
    Read-Host "Press Enter to exit"
}
