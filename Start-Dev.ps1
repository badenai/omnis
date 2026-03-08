<#
.SYNOPSIS
    Start Omnis in development mode.

.DESCRIPTION
    Launches the FastAPI backend (port 8420) and Vite frontend (port 5173).
    Press Ctrl+C to stop both.

.PARAMETER NoFrontend
    Skip starting the frontend dev server.

.PARAMETER NoBrowser
    Do not open the browser automatically.
#>
param(
    [switch]$NoFrontend,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

# ---------------------------------------------------------------------------
# Load .env
# ---------------------------------------------------------------------------
$EnvFile = Join-Path $Root ".env"
if (Test-Path $EnvFile) {
    foreach ($line in Get-Content $EnvFile) {
        if ($line -match "^\s*([^#][^=]+)=(.*)$") {
            $k = $Matches[1].Trim()
            $v = $Matches[2].Trim()
            if (-not [System.Environment]::GetEnvironmentVariable($k, "Process")) {
                [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
            }
        }
    }
    Write-Host "Loaded .env" -ForegroundColor DarkGray
}

# ---------------------------------------------------------------------------
# Validate required env vars
# ---------------------------------------------------------------------------
if (-not $env:GEMINI_API_KEY -or $env:GEMINI_API_KEY -eq "your-gemini-api-key-here") {
    Write-Host ""
    Write-Host "ERROR: GEMINI_API_KEY is not set." -ForegroundColor Red
    Write-Host "Add it to .env or set it in your environment." -ForegroundColor Red
    Write-Host ""
    exit 1
}

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Omnis - dev mode" -ForegroundColor Cyan
Write-Host "  Backend   http://localhost:8420" -ForegroundColor Green
if (-not $NoFrontend) {
    Write-Host "  Frontend  http://localhost:5173" -ForegroundColor Green
}
Write-Host "  Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

# ---------------------------------------------------------------------------
# Start backend
# ---------------------------------------------------------------------------
$BackendLog    = Join-Path $Root ".backend.log"
$BackendLogErr = Join-Path $Root ".backend.err.log"

$BackendArgs = "run", "uvicorn", "api.app:create_app",
               "--factory", "--host", "127.0.0.1", "--port", "8420",
               "--reload", "--log-level", "info"

$BackendProc = Start-Process -FilePath "uv" `
    -ArgumentList $BackendArgs `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $BackendLog `
    -RedirectStandardError $BackendLogErr `
    -NoNewWindow -PassThru

Write-Host "[backend]  PID $($BackendProc.Id) -- logs: .backend.log / .backend.err.log" -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
# Start frontend
# ---------------------------------------------------------------------------
$FrontendProc = $null
if (-not $NoFrontend) {
    $WebDir        = Join-Path $Root "web"
    $FrontendLog   = Join-Path $Root ".frontend.log"
    $FrontendLogErr = Join-Path $Root ".frontend.err.log"

    $FrontendProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "npm", "run", "dev" `
        -WorkingDirectory $WebDir `
        -RedirectStandardOutput $FrontendLog `
        -RedirectStandardError $FrontendLogErr `
        -NoNewWindow -PassThru

    Write-Host "[frontend] PID $($FrontendProc.Id) -- logs: .frontend.log / .frontend.err.log" -ForegroundColor DarkGray
}

Write-Host ""

# ---------------------------------------------------------------------------
# Open browser after a short delay
# ---------------------------------------------------------------------------
# if (-not $NoBrowser -and -not $NoFrontend) {
#     Start-Job -ScriptBlock { Start-Sleep 3; Start-Process "http://localhost:5173" } | Out-Null
# }

# ---------------------------------------------------------------------------
# Wait -- Ctrl+C triggers the finally block
# ---------------------------------------------------------------------------
$Pos = @{
    BackendOut  = 0
    BackendErr  = 0
    FrontendOut = 0
    FrontendErr = 0
}

function Drain-Log($path, $posKey, $prefix, $color) {
    if (Test-Path $path) {
        $lines = Get-Content $path
        $newLines = $lines | Select-Object -Skip $Pos[$posKey]
        foreach ($l in $newLines) {
            Write-Host "$prefix $l" -ForegroundColor $color
        }
        $Pos[$posKey] += $newLines.Count
    }
}

try {
    while ($true) {
        Start-Sleep -Milliseconds 300

        Drain-Log $BackendLog    "BackendOut"  "[api]" DarkGray
        Drain-Log $BackendLogErr "BackendErr"  "[api]" DarkGray

        if (-not $NoFrontend) {
            Drain-Log $FrontendLog    "FrontendOut" "[web]" DarkCyan
            Drain-Log $FrontendLogErr "FrontendErr" "[web]" DarkCyan
        }

        # Detect unexpected backend exit
        if ($BackendProc.HasExited) {
            Write-Host ""
            Write-Host "Backend exited unexpectedly (code $($BackendProc.ExitCode))." -ForegroundColor Red
            break
        }
    }
}
finally {
    Write-Host ""
    Write-Host "Stopping..." -ForegroundColor Yellow

    if ($null -ne $FrontendProc -and -not $FrontendProc.HasExited) {
        Stop-Process -Id $FrontendProc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "[frontend] stopped." -ForegroundColor DarkGray
    }
    if (-not $BackendProc.HasExited) {
        Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "[backend]  stopped." -ForegroundColor DarkGray
    }

    Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue
    Write-Host "Done." -ForegroundColor Green
    Write-Host ""
}
