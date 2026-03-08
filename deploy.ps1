#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Use Git Bash explicitly (same reason as ci.ps1 — WSL 1 doesn't support Node.js)
$gitBash = @(
    'C:\Program Files\Git\bin\bash.exe',
    'C:\Program Files (x86)\Git\bin\bash.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $gitBash) {
    Write-Error "Git Bash not found. Install Git for Windows."
    exit 1
}

# -- Run CI first ---------------------------------------------------------------

& "$PSScriptRoot\ci.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[FAIL]  CI failed - aborting deploy" -ForegroundColor Red
    exit 1
}

# -- Deploy via deploy.sh -------------------------------------------------------

Write-Host ""
Write-Host "==  Deploy  ==" -ForegroundColor Yellow

# WSL bash has rsync natively; convert SSH key path to WSL format
$winHome = $HOME -replace '\\', '/'
$wslSshKey = '/mnt/' + $winHome[0].ToString().ToLower() + $winHome.Substring(2) + '/.ssh/id_ed25519_deploy'

Push-Location $PSScriptRoot
bash ./deploy/deploy.sh --skip-build "--ssh-key=$wslSshKey" @args
$deployCode = $LASTEXITCODE
Pop-Location
if ($deployCode -ne 0) {
    Write-Host ""
    Write-Host "[FAIL]  Deploy failed" -ForegroundColor Red
    exit 1
}
