<#
.SYNOPSIS
    Start Cloracle in development mode.

.DESCRIPTION
    Launches the FastAPI backend (port 8420) and Vite frontend (port 5173)
    as background jobs. Press Ctrl+C to stop both.

.PARAMETER NoFrontend
    Skip starting the frontend dev server.

.PARAMETER NoBrowser
    Do not open the browser automatically.
#>
param(
    [switch]$NoFrontend,
    [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot

# ---------------------------------------------------------------------------
# Load .env
# ---------------------------------------------------------------------------
$EnvFile = Join-Path $Root ".env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
            $name  = $Matches[1].Trim()
            $value = $Matches[2].Trim()
            if (-not [System.Environment]::GetEnvironmentVariable($name)) {
                [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
            }
        }
    }
    Write-Host "  Loaded .env" -ForegroundColor DarkGray
}

# ---------------------------------------------------------------------------
# Validate required env vars
# ---------------------------------------------------------------------------
if (-not $env:GEMINI_API_KEY -or $env:GEMINI_API_KEY -eq "your-gemini-api-key-here") {
    Write-Host ""
    Write-Host "  ERROR: GEMINI_API_KEY is not set." -ForegroundColor Red
    Write-Host "  Add it to .env or set it in your environment before running." -ForegroundColor Red
    Write-Host ""
    exit 1
}

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "  Cloracle — dev mode" -ForegroundColor Cyan
Write-Host "  Backend   http://localhost:8420" -ForegroundColor Green
if (-not $NoFrontend) {
    Write-Host "  Frontend  http://localhost:5173" -ForegroundColor Green
}
Write-Host "  Press Ctrl+C to stop all processes." -ForegroundColor DarkGray
Write-Host ""

# ---------------------------------------------------------------------------
# Start backend
# ---------------------------------------------------------------------------
$BackendLog = Join-Path $Root ".backend.log"
$BackendProc = Start-Process -FilePath "uv" `
    -ArgumentList @(
        "run", "uvicorn",
        "api.app:create_app",
        "--factory",
        "--host", "127.0.0.1",
        "--port", "8420",
        "--reload",
        "--log-level", "info"
    ) `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $BackendLog `
    -RedirectStandardError  "$BackendLog.err" `
    -NoNewWindow `
    -PassThru

Write-Host "  [backend]  PID $($BackendProc.Id) — logging to .backend.log" -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
# Start frontend
# ---------------------------------------------------------------------------
$FrontendProc = $null
if (-not $NoFrontend) {
    $WebDir = Join-Path $Root "web"
    $FrontendLog = Join-Path $Root ".frontend.log"
    $FrontendProc = Start-Process -FilePath "npm" `
        -ArgumentList @("run", "dev") `
        -WorkingDirectory $WebDir `
        -RedirectStandardOutput $FrontendLog `
        -RedirectStandardError  "$FrontendLog.err" `
        -NoNewWindow `
        -PassThru
    Write-Host "  [frontend] PID $($FrontendProc.Id) — logging to .frontend.log" -ForegroundColor DarkGray
}

Write-Host ""

# ---------------------------------------------------------------------------
# Open browser after a short delay
# ---------------------------------------------------------------------------
if (-not $NoBrowser -and -not $NoFrontend) {
    Start-Job -ScriptBlock {
        Start-Sleep -Seconds 3
        Start-Process "http://localhost:5173"
    } | Out-Null
}

# ---------------------------------------------------------------------------
# Tail logs and wait — Ctrl+C triggers finally block
# ---------------------------------------------------------------------------
try {
    while ($true) {
        # Surface any new backend output to the console
        if (Test-Path $BackendLog) {
            $lines = Get-Content $BackendLog -Tail 0 -Wait -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 1

        # Exit early if backend dies unexpectedly
        if ($BackendProc.HasExited) {
            Write-Host ""
            Write-Host "  Backend exited (code $($BackendProc.ExitCode)). Check .backend.log." -ForegroundColor Red
            break
        }
    }
} finally {
    Write-Host ""
    Write-Host "  Stopping..." -ForegroundColor Yellow

    if ($FrontendProc -and -not $FrontendProc.HasExited) {
        Stop-Process -Id $FrontendProc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "  [frontend] stopped." -ForegroundColor DarkGray
    }
    if (-not $BackendProc.HasExited) {
        Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "  [backend]  stopped." -ForegroundColor DarkGray
    }

    # Clean up background jobs
    Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue

    Write-Host "  Done." -ForegroundColor Green
    Write-Host ""
}
