#Requires -Version 5.1
<#
.SYNOPSIS
    Pull plugin skills from the remote Omnis server into the local Claude plugin cache.

.DESCRIPTION
    Fetches each agent's cluster skills via the Omnis HTTP API and writes them to
    ~/.claude/plugins/cache/omnis/<agent-id>/1.0.0/skills/<cluster>/SKILL.md
    along with plugin.json, hooks/, and .mcp.json so Claude Code picks up the
    full plugin automatically.

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

$Root = Split-Path $PSScriptRoot -Parent

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
                [System.Environment]::GetEnvironmentVariable($k, $v, "Process")
            }
        }
    }
}

# ---------------------------------------------------------------------------
# Validate settings
# ---------------------------------------------------------------------------
$BaseUrl  = ($env:OMNIS_BASE_URL  ?? "").TrimEnd("/")
$User     = $env:OMNIS_USER     ?? ""
$Password = $env:OMNIS_PASSWORD ?? ""

if (-not $BaseUrl) {
    Write-Host "ERROR: OMNIS_BASE_URL is not set." -ForegroundColor Red; exit 1
}
if (-not $User -or -not $Password) {
    Write-Host "ERROR: OMNIS_USER and OMNIS_PASSWORD are required." -ForegroundColor Red; exit 1
}

$Bytes   = [System.Text.Encoding]::UTF8.GetBytes("${User}:${Password}")
$B64     = [System.Convert]::ToBase64String($Bytes)
$Headers = @{ Authorization = "Basic $B64" }

$PluginCacheDir = Join-Path $HOME ".claude/plugins/cache/omnis"
$PluginVersion  = "1.0.0"

# ---------------------------------------------------------------------------
# Fetch agent list
# ---------------------------------------------------------------------------
Write-Host "Fetching agent list from $BaseUrl ..." -ForegroundColor Cyan

try {
    $AgentList = @(Invoke-RestMethod -Uri "$BaseUrl/api/agents" -Headers $Headers -Method Get)
} catch {
    Write-Host "ERROR: Failed to fetch agents — $($_.Exception.Message)" -ForegroundColor Red; exit 1
}

if ($AgentList.Count -eq 0) {
    Write-Host "No agents found on server." -ForegroundColor Yellow; exit 0
}

$Updated = 0; $Skipped = 0; $Failed = 0

foreach ($Agent in $AgentList) {
    $AgentId = $Agent.agent_id
    if (-not $AgentId) { continue }

    Write-Host "  [$AgentId]" -NoNewline

    # Fetch cluster skills
    try {
        $Skills = @(Invoke-RestMethod -Uri "$BaseUrl/api/knowledge/$AgentId/skills" -Headers $Headers -Method Get)
    } catch {
        $StatusCode = $_.Exception.Response?.StatusCode
        if ($StatusCode -eq 404) {
            Write-Host " (no skills yet, skipping)" -ForegroundColor DarkGray; $Skipped++
        } else {
            Write-Host " FAILED — $($_.Exception.Message)" -ForegroundColor Red; $Failed++
        }
        continue
    }

    if ($Skills.Count -eq 0) {
        Write-Host " (no skills yet, skipping)" -ForegroundColor DarkGray; $Skipped++
        continue
    }

    $InstallPath = Join-Path $PluginCacheDir "$AgentId/$PluginVersion"

    if ($DryRun) {
        Write-Host " → $InstallPath [DRY RUN, $($Skills.Count) skill(s)]" -ForegroundColor DarkYellow
        $Updated++; continue
    }

    # --- Cluster skills ---
    $SkillsDir = Join-Path $InstallPath "skills"
    # Clear stale clusters
    if (Test-Path $SkillsDir) { Remove-Item $SkillsDir -Recurse -Force }

    foreach ($Skill in $Skills) {
        $ClusterDir = Join-Path $SkillsDir $Skill.name
        New-Item -ItemType Directory -Path $ClusterDir -Force | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $ClusterDir "SKILL.md"), $Skill.content, [System.Text.Encoding]::UTF8)
    }

    # --- plugin.json ---
    $ManifestDir = Join-Path $InstallPath ".claude-plugin"
    New-Item -ItemType Directory -Path $ManifestDir -Force | Out-Null
    $PluginJson = @{
        name        = "omnis-$AgentId"
        version     = $PluginVersion
        description = "Knowledge agent for $AgentId"
        author      = "Omnis"
        hooks       = "./hooks/hooks.json"
        mcp         = "./.mcp.json"
    } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText((Join-Path $ManifestDir "plugin.json"), $PluginJson, [System.Text.Encoding]::UTF8)

    # --- hooks ---
    $HooksDir = Join-Path $InstallPath "hooks"
    New-Item -ItemType Directory -Path $HooksDir -Force | Out-Null
    $HooksJson = '{"SessionStart":[{"matcher":"startup|resume","hooks":[{"type":"command","command":"node \"${CLAUDE_PLUGIN_ROOT}/hooks/inject-digest.js\""}]}]}'
    [System.IO.File]::WriteAllText((Join-Path $HooksDir "hooks.json"), $HooksJson, [System.Text.Encoding]::UTF8)
    $InjectJs = "const fs = require('fs'), path = require('path');`nconst f = path.join(process.env.CLAUDE_PLUGIN_ROOT, 'references', 'digest.md');`nif (fs.existsSync(f)) process.stdout.write(fs.readFileSync(f, 'utf8').split('`n').slice(0, 80).join('`n'));`n"
    [System.IO.File]::WriteAllText((Join-Path $HooksDir "inject-digest.js"), $InjectJs, [System.Text.Encoding]::UTF8)

    # --- .mcp.json ---
    $McpJson = "{`"mcpServers`":{`"omnis-$AgentId`":{`"type`":`"sse`",`"url`":`"$BaseUrl/mcp`"}}}"
    [System.IO.File]::WriteAllText((Join-Path $InstallPath ".mcp.json"), $McpJson, [System.Text.Encoding]::UTF8)

    # --- digest (references) ---
    try {
        $DigestResp = Invoke-RestMethod -Uri "$BaseUrl/api/knowledge/$AgentId/digest" -Headers $Headers -Method Get
        $RefsDir = Join-Path $InstallPath "references"
        New-Item -ItemType Directory -Path $RefsDir -Force | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $RefsDir "digest.md"), $DigestResp.content, [System.Text.Encoding]::UTF8)
    } catch { <# digest missing is non-fatal #> }

    # --- Register in installed_plugins.json ---
    $PluginsFile = Join-Path $HOME ".claude/plugins/installed_plugins.json"
    $PluginKey   = "omnis@$AgentId"
    $Now         = (Get-Date).ToUniversalTime().ToString("o")
    if (Test-Path $PluginsFile) {
        $PluginsData = Get-Content $PluginsFile -Raw | ConvertFrom-Json
    } else {
        New-Item -ItemType Directory -Path (Split-Path $PluginsFile) -Force | Out-Null
        $PluginsData = [PSCustomObject]@{ version = 2; plugins = [PSCustomObject]@{} }
    }
    $Entry = [PSCustomObject]@{
        scope       = "user"
        installPath = $InstallPath -replace '\\', '/'
        version     = $PluginVersion
        installedAt = $Now
        lastUpdated = $Now
    }
    if ($PluginsData.plugins.PSObject.Properties[$PluginKey]) {
        $PluginsData.plugins.$PluginKey[0].lastUpdated = $Now
    } else {
        $PluginsData.plugins | Add-Member -NotePropertyName $PluginKey -NotePropertyValue @($Entry)
    }
    $PluginsData | ConvertTo-Json -Depth 10 | Set-Content $PluginsFile -Encoding UTF8

    Write-Host " → $InstallPath ($($Skills.Count) skill(s))" -ForegroundColor Green
    $Updated++
}

Write-Host ""
Write-Host "Done. Updated: $Updated  Unchanged: $Skipped  Failed: $Failed" -ForegroundColor Cyan
if ($Failed -gt 0) { exit 1 }
