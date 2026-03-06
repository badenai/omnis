Set-StrictMode -Off
$ErrorActionPreference = "Stop"

Write-Host "Building frontend..."
Push-Location "$PSScriptRoot\web"
npm install --silent
npm run build
Pop-Location

# Convert Windows SSH key path to WSL format (/mnt/c/Users/...) so bash can find it
$winHome = $HOME -replace '\\', '/'
$wslHome = '/mnt/' + $winHome[0].ToString().ToLower() + $winHome.Substring(2)
$wslSshKey = "$wslHome/.ssh/id_ed25519_deploy"

bash deploy/deploy.sh --skip-build "--ssh-key=$wslSshKey" @args
