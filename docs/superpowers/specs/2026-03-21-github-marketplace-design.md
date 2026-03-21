# GitHub Marketplace Integration — Design Spec

**Date:** 2026-03-21
**Status:** Approved

---

## Problem

Omnis currently publishes agent skills by writing directly to `~/.claude/plugins/cache/omnis/<id>/`
and registering in `installed_plugins.json`. This is local-only — no way to share agents with
other people. The Omnis server (`omnis.knopfdruck.ai`) is behind Caddy basic auth and cannot
serve public endpoints.

## Goal

Make every Omnis agent installable by anyone via the Claude Code plugin marketplace, using a
public GitHub repository as the distribution channel. Remove the local plugin cache write path
entirely — GitHub becomes the single publication channel for all users including the Omnis
operator.

---

## Architecture

```
[consolidation finishes]
        │
        ▼
PluginWriter.write()             ← unchanged content logic; return type updated
        │  returns (skill_changed: bool, version: str)
        ▼
GitHubPublisher.publish()        ← NEW: reads from ~/.omnis/agents/<id>/
  ├── upserts agents/<id>/ tree to GitHub repo via Contents API
  └── merges marketplace.json at repo root
        │
        ▼
[recipients install]
  /plugin marketplace add https://raw.githubusercontent.com/<owner>/omnis-plugins/main/marketplace.json
  /plugin install <agent-id>@omnis
```

The Omnis server is never involved in distribution. No credentials are embedded in published
files. Recipients who want MCP must configure it manually in their Claude Code settings.

---

## Terminology

**Cluster:** A topic-specific skill grouping produced by `generate_plugin_skills()`. Each
cluster has a kebab-case slug stored in `SkillSpec.name` (the `name` field of the
`SkillSpec` dataclass in `core/models/types.py`). Example values: `risk-management`,
`trading-fundamentals`. Cluster slugs become directory names under `skills/` in both the
agent directory and the GitHub repo.

---

## Components

### 1. `core/github_publisher.py` (new)

```python
class GitHubPublisher:
    def __init__(self, token: str, repo: str, branch: str = "main"): ...

    @classmethod
    def from_env(cls) -> "GitHubPublisher | None":
        """Returns None if GITHUB_TOKEN or GITHUB_MARKETPLACE_REPO is absent.
        GITHUB_MARKETPLACE_BRANCH is optional (default 'main')."""

    def publish(self, agent_id: str, agent_dir: pathlib.Path, version: str) -> None:
        """Push plugin snapshot for one agent and regenerate marketplace.json.
        version is the string resolved inside PluginWriter.write()."""

    def _collect_files(self, agent_id: str, agent_dir: pathlib.Path) -> dict[str, str]:
        """Return {github_path: utf-8 content} for all files to publish.
        Iterates agent_dir/skills/ using SkillSpec.name (not cluster_name) to
        discover cluster directories."""

    def _build_plugin_json(self, agent_id: str, agent_dir: pathlib.Path) -> str:
        """Generate a new plugin.json for GitHub distribution.
        This is NOT the local .claude-plugin/plugin.json — it is generated fresh
        with no 'mcp' field and no 'hooks' → 'mcp' reference. Hooks wiring is
        retained (see hook inclusion below). Schema mirrors the local manifest
        minus the mcp section."""

    def _upsert_file(self, path: str, content: str) -> None:
        """PUT /repos/{repo}/contents/{path} — create or update.
        Fetches current SHA first if file exists (required by GitHub API)."""

    def _regenerate_marketplace(self, agent_id: str, version: str, description: str) -> None:
        """Merge-update marketplace.json at repo root.
        1. GET current marketplace.json (if missing, start with empty plugins list).
        2. Upsert entry for agent_id by matching on 'name' field.
        3. Write back via _upsert_file().
        Raises on unexpected errors — caller wraps in try/except."""

    def _extract_description(self, agent_dir: pathlib.Path) -> str:
        """For marketplace.json only — does not affect agent file generation.
        Read SOUL.md. Skip blank lines and lines starting with '#'.
        Take the first eligible line, strip leading/trailing markdown bold/italic
        markers (* and _), truncate to 200 chars.
        Returns '' if SOUL.md is missing or has no eligible line."""
```

**Transport:** `httpx` (already in `pyproject.toml` at `httpx>=0.27.0` — no action needed).

**Files published per agent** under `agents/<agent-id>/` in the GitHub repo:

| Local source path | GitHub path | Condition |
|---|---|---|
| `agent_dir/skills/<cluster>/SKILL.md` (all clusters) | `agents/<id>/skills/<cluster>/SKILL.md` | always |
| `agent_dir/agents/<agent_id>.md` | `agents/<id>/agents/<id>.md` | always |
| `agent_dir/references/digest.md` | `agents/<id>/references/digest.md` | always |
| `agent_dir/hooks/hooks.json` | `agents/<id>/hooks/hooks.json` | always |
| `agent_dir/hooks/inject-digest.js` | `agents/<id>/hooks/inject-digest.js` | always |
| *(generated)* | `agents/<id>/plugin.json` | always |

Where `agent_dir` = `~/.omnis/agents/<agent_id>/`.

**Why hooks are always included:** `inject-digest.js` uses `process.env.CLAUDE_PLUGIN_ROOT`
(an environment variable set by the Claude Code runtime to the plugin's install directory),
not a hardcoded `~/.omnis/...` path. It is safe to distribute.

**Explicitly excluded:**
- `.mcp.json` — points to `localhost:8420`, meaningless for remote users
- The `mcp` key in the generated `plugin.json`

### 2. `marketplace.json` (repo root, auto-generated)

**The exact Claude Code marketplace.json schema must be verified against official Claude Code
plugin marketplace documentation before implementing `_regenerate_marketplace()`.** If the
documentation is unavailable, install a known marketplace and inspect its `marketplace.json`
as a reference. Do not guess field names.

Expected shape based on available information:

```json
{
  "name": "omnis",
  "description": "Omnis knowledge agents",
  "plugins": [
    {
      "name": "<agent-id>",
      "description": "<from _extract_description — SOUL.md first non-heading line>",
      "version": "<version string from PluginWriter>",
      "source": "https://github.com/<owner>/omnis-plugins",
      "subdirectory": "agents/<agent-id>"
    }
  ]
}
```

**Version source:** `PluginWriter.write()` resolves the version internally (reads
`plugin_version.txt` or auto-increments). The resolved string is returned as the second
element of the new `tuple[bool, str]` return value and passed to `publish()`.

**Merge strategy:** Fetch existing `marketplace.json`, upsert entry by `name` match, write
back. No full-tree listing of `agents/`. If `_regenerate_marketplace()` raises, the caller
logs a warning and returns — the agent's skill files are already pushed.

### 3. Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `GITHUB_TOKEN` | yes | — | PAT with `repo` scope (or fine-grained token with contents write) |
| `GITHUB_MARKETPLACE_REPO` | yes | — | e.g. `owner/omnis-plugins` |
| `GITHUB_MARKETPLACE_BRANCH` | no | `main` | Target branch |

`from_env()` returns `None` if `GITHUB_TOKEN` or `GITHUB_MARKETPLACE_REPO` is absent.

### 4. Integration point — `core/consolidation.py`

**`PluginWriter.write()` return type change:** currently returns `bool` (skill changed).
Change to `tuple[bool, str]` — `(skill_changed, version)` where `version` is the local
variable named `version` (a string) already computed inside `write()` at the point where it
is written to `plugin_version.txt`. Return it as-is; no additional computation needed.
Update both callers:

- `ConsolidationPipeline.run()` — change assignment to `skill_changed, version = pw.write(...)`
- `ConsolidationPipeline.run_reevaluation()` — change to `_, version = pw.write(...)` (or
  `pw.write(...)` if version is not needed there)

After `skill_changed, version = pw.write(plugin_output)` in `run()`:

```python
try:
    from core.github_publisher import GitHubPublisher
    publisher = GitHubPublisher.from_env()
    if publisher:
        job_status.log(agent_id, task, "Publishing to GitHub marketplace…")
        publisher.publish(agent_id, self._dir, version)
        job_status.log(agent_id, task, "GitHub marketplace updated")
except Exception as e:
    logger.warning(f"[{agent_id}] GitHub publish failed (non-fatal): {e}")
```

Add the same publisher block to `run_reevaluation()` after its `pw.write()` call.

---

## PluginWriter and SkillWriter Cleanup

Both `PluginWriter` and `SkillWriter` write to the local Claude plugin cache and must both
be cleaned up.

### `PluginWriter` (in `core/skill_writer.py`)

**Remove from `write()`:**
- The block that computes `install_path = Path.home() / ".claude" / "plugins" / "cache" / ...`
  and copies skill files, hooks, `.mcp.json`, and `plugin.json` into it. This block also
  generates the `.mcp.json` content — remove that generation too.
- The call to `_register_plugin()` and the method itself.

**Change return type:** `write()` currently returns `bool`. Change to `tuple[bool, str]`
returning `(skill_changed, resolved_version)`.

### `SkillWriter` (in `core/skill_writer.py`)

**`SkillWriter.write()`** also writes to `~/.claude/plugins/cache/` (mirrors the primary
`SKILL.md` there). Remove that cache write. Keep only the writes to `~/.omnis/agents/<id>/`.
Remove `SkillWriter._register_plugin()` and its call.

**`SkillWriter.revert_to_previous()`** also writes to the plugin cache (lines ~139–145).
Remove those cache writes too — after cleanup, reverting the skill updates only
`~/.omnis/agents/<id>/SKILL.md`.

`SkillWriter` is still used in the soul autopilot path (`consolidation.py` line ~448:
`sw.write(last_kept_skill, agent_id)`). After cleanup, `SkillWriter.write()` writes only
to `~/.omnis/agents/<id>/SKILL.md` with no plugin cache side-effect.

### `consolidation.py`

**Remove from both `run()` and `run_reevaluation()`:**
```python
reg = Registry(DATA_DIR / "registry.json")
reg.register(self._config.agent_id, self._dir / "SKILL.md")
reg.save()
```

Remove the `Registry` import if it becomes unused.

---

## Error Handling

| Failure | Behaviour |
|---|---|
| GitHub API error (rate limit, auth, 5xx) | Log warning, consolidation continues |
| `GITHUB_TOKEN` not set | `from_env()` returns None, step skipped silently |
| `GITHUB_MARKETPLACE_REPO` not set | `from_env()` returns None, step skipped silently |
| Agent has no skills | `publish()` is a no-op |
| `marketplace.json` regeneration fails | Log warning; skill files already pushed |
| `SOUL.md` missing or no eligible line | `description` is `""` in marketplace entry |

---

## Open Questions (resolve before writing code)

1. **Claude Code `marketplace.json` exact schema** — verify field names and the `source`
   field format against official Claude Code plugin marketplace documentation or an existing
   marketplace's JSON file before implementing `_regenerate_marketplace()`. This is the only
   remaining unknown that blocks implementation.

---

## Out of Scope

- MCP auth wiring for remote users (manual opt-in only)
- Per-agent GitHub repositories
- GitHub Actions or CI triggers
- Rollback of GitHub pushes on skill quality regression
- Deletion of marketplace entries when an agent is removed from Omnis
