#Requires -Version 5.1
<#
.SYNOPSIS
    Syncs develop, merges into main, pushes (triggers GitHub Pages deploy), then returns to develop.
.DESCRIPTION
    Run from develop when ready to publish the platform. Never work in main; this script does the merge and push.
.USAGE
    .\scripts\publish-platform.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$DevelopBranch = "develop"
$MainBranch   = "main"

function Write-Step([string]$msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}

# 1. Reject if there are uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host "Uncommitted changes found. Commit or stash them first." -ForegroundColor Red
    git status -s
    exit 1
}

$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne $DevelopBranch) {
    Write-Host "Not on '$DevelopBranch'. Checkout '$DevelopBranch' first, then run this script." -ForegroundColor Yellow
    exit 1
}

# 2. Sync develop
Write-Step "Syncing '$DevelopBranch'..."
git fetch origin
git pull origin $DevelopBranch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "    Done." -ForegroundColor Green

# 3. Switch to main and sync
Write-Step "Switching to '$MainBranch' and syncing..."
git checkout $MainBranch
git pull origin $MainBranch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "    Done." -ForegroundColor Green

# 4. Merge develop into main
Write-Step "Merging '$DevelopBranch' into '$MainBranch'..."
git merge $DevelopBranch -m "Merge $DevelopBranch into $MainBranch for platform release"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Merge failed (conflicts?). Fix conflicts, commit, then push: git push origin $MainBranch" -ForegroundColor Red
    Write-Host "Or abort the merge: git merge --abort" -ForegroundColor Red
    if (Test-Path (Join-Path (git rev-parse --show-toplevel) ".git/MERGE_HEAD")) {
        Write-Host "You are on '$MainBranch' with a merge in progress. After abort or commit, run: git checkout $DevelopBranch" -ForegroundColor Yellow
    } else {
        Write-Host "You are on '$MainBranch'. When done, run: git checkout $DevelopBranch (required before running this script again)." -ForegroundColor Yellow
    }
    exit 1
}
Write-Host "    Done." -ForegroundColor Green

# 5. Push main (triggers GitHub Actions → GitHub Pages)
Write-Step "Pushing '$MainBranch' (triggers deploy)..."
git push origin $MainBranch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "    Done." -ForegroundColor Green

# 6. Back to develop
Write-Step "Switching back to '$DevelopBranch'..."
git checkout $DevelopBranch
Write-Host "    Done." -ForegroundColor Green

Write-Host "`nPublish done. GitHub Actions will deploy the platform to GitHub Pages." -ForegroundColor Green
