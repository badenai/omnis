#Requires -Version 5.1
<#
.SYNOPSIS
    Pull SKILL.md files from the remote Omnis server into the local Claude plugin cache.

.DESCRIPTION
    Fetches each agent's SKILL.md via the Omnis HTTP API and writes it to
    ~/.claude/plugins/cache/omnis/<agent-id>/SKILL.md so Claude Code picks
    it up automatically in every session.

    Reads connection settings from environment variables or a local .env file:
        OMNIS_BASE_URL   https://omnis.yourdomain.com
        OMNIS_USER       caddy-basicauth username
        OMNIS_PASSWORD   caddy-basicauth password

.PARAMETER DryRun
    Print what would be written without actually writing any files.
#>
param(
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# .env lives in the repo root, one level above this scripts/ directory
$Root = Split-Path $PSScriptRoot -Parent

# ---------------------------------------------------------------------------
# Load .env (same pattern as Start-Dev.ps1 — existing vars take priority)
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
}

# ---------------------------------------------------------------------------
# Validate required settings
# ---------------------------------------------------------------------------
$BaseUrl  = ($env:OMNIS_BASE_URL  ?? "").TrimEnd("/")
$User     = $env:OMNIS_USER     ?? ""
$Password = $env:OMNIS_PASSWORD ?? ""

if (-not $BaseUrl) {
    Write-Host "ERROR: OMNIS_BASE_URL is not set. Add it to .env or your environment." -ForegroundColor Red
    exit 1
}
if (-not $User -or -not $Password) {
    Write-Host "ERROR: OMNIS_USER and OMNIS_PASSWORD are required. Add them to .env or your environment." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# Build Authorization header
# ---------------------------------------------------------------------------
$Bytes   = [System.Text.Encoding]::UTF8.GetBytes("${User}:${Password}")
$B64     = [System.Convert]::ToBase64String($Bytes)
$Headers = @{ Authorization = "Basic $B64" }

# ---------------------------------------------------------------------------
# Destination directory
# ---------------------------------------------------------------------------
$PluginCacheDir = Join-Path $HOME ".claude/plugins/cache/omnis"

# ---------------------------------------------------------------------------
# Fetch agent list
# ---------------------------------------------------------------------------
Write-Host "Fetching agent list from $BaseUrl ..." -ForegroundColor Cyan

try {
    $AgentsResponse = Invoke-RestMethod -Uri "$BaseUrl/api/agents" -Headers $Headers -Method Get
} catch {
    Write-Host "ERROR: Failed to fetch agents — $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Wrap in @() to guarantee array semantics when the server returns a single agent
$AgentList = @($AgentsResponse)
if ($AgentList.Count -eq 0) {
    Write-Host "No agents found on server." -ForegroundColor Yellow
    exit 0
}

$Updated = 0
$Skipped = 0
$Failed  = 0

foreach ($Agent in $AgentList) {
    $AgentId = $Agent.agent_id
    if (-not $AgentId) { continue }

    Write-Host "  [$AgentId]" -NoNewline

    # Fetch SKILL.md content — 404 means consolidation hasn't run yet, not an error
    try {
        $SkillResponse = Invoke-RestMethod -Uri "$BaseUrl/api/knowledge/$AgentId/skill" -Headers $Headers -Method Get
    } catch {
        $StatusCode = $_.Exception.Response?.StatusCode
        if ($StatusCode -eq 404) {
            Write-Host " (no skill yet, skipping)" -ForegroundColor DarkGray
            $Skipped++
        } else {
            Write-Host " FAILED — $($_.Exception.Message)" -ForegroundColor Red
            $Failed++
        }
        continue
    }

    $Content = $SkillResponse.content
    if (-not $Content) {
        Write-Host " (no skill content, skipping)" -ForegroundColor DarkGray
        $Skipped++
        continue
    }

    # Write to plugin cache
    $DestDir  = Join-Path $PluginCacheDir $AgentId
    $DestFile = Join-Path $DestDir "SKILL.md"

    if ($DryRun) {
        Write-Host " → $DestFile [DRY RUN]" -ForegroundColor DarkYellow
        $Updated++
        continue
    }

    if (-not (Test-Path $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    }

    # Skip write if content is identical (use File IO to avoid BOM differences across PS versions)
    if ((Test-Path $DestFile) -and ([System.IO.File]::ReadAllText($DestFile) -eq $Content)) {
        Write-Host " (unchanged)" -ForegroundColor DarkGray
        $Skipped++
        continue
    }

    [System.IO.File]::WriteAllText($DestFile, $Content, [System.Text.Encoding]::UTF8)
    Write-Host " → $DestFile" -ForegroundColor Green
    $Updated++
}

Write-Host ""
Write-Host "Done. Updated: $Updated  Unchanged: $Skipped  Failed: $Failed" -ForegroundColor Cyan
if ($Failed -gt 0) { exit 1 }
