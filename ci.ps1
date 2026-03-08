#Requires -Version 5.1

# Use Git Bash explicitly — WSL 1 doesn't support Node.js or Windows tool paths
$gitBash = @(
    'C:\Program Files\Git\bin\bash.exe',
    'C:\Program Files (x86)\Git\bin\bash.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $gitBash) {
    Write-Error "Git Bash not found. Install Git for Windows."
    exit 1
}

Push-Location $PSScriptRoot
& $gitBash ./ci.sh @args
$code = $LASTEXITCODE
Pop-Location
exit $code
