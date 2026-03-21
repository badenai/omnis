# GitHub Marketplace Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace local Claude Code plugin cache writes with a GitHub repository as the sole publication channel, making every Omnis agent installable via the Claude Code plugin marketplace.

**Architecture:** `PluginWriter.write()` writes to `~/.omnis/agents/<id>/` as before, then returns `(skill_changed, version)`. A new `GitHubPublisher` reads from that same directory and upserts files to a public GitHub repo via the Contents API, then merges `marketplace.json` at the repo root. All local plugin cache writes (both `PluginWriter` and `SkillWriter`) are removed.

**Tech Stack:** Python, `httpx` (already in pyproject.toml), GitHub REST API (Contents API), pytest + pytest-mock

**Spec:** `docs/superpowers/specs/2026-03-21-github-marketplace-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `core/github_publisher.py` | **Create** | GitHub Contents API client + marketplace.json merge |
| `tests/test_github_publisher.py` | **Create** | Unit tests for GitHubPublisher |
| `core/skill_writer.py` | **Modify** | Remove all plugin cache writes; change PluginWriter return type |
| `core/consolidation.py` | **Modify** | Wire GitHubPublisher; remove Registry; update pw.write() unpacking |
| `tests/test_skill_writer.py` | **Modify** | Delete tests that assert cache writes; add tests asserting no cache writes |
| `tests/test_consolidation.py` | **Modify** | Remove Registry mock; add publisher mock |

---

## Task 1: Resolve the marketplace.json schema

The open question from the spec: what is the exact JSON format Claude Code expects for a
plugin marketplace file? This must be answered before implementing `_regenerate_marketplace()`.

**Files:**
- No code changes — research task only.
- Record the confirmed schema in a comment block at the top of `core/github_publisher.py`
  (written in Task 2).

- [ ] **Step 1: Search locally for a real marketplace.json**

  ```bash
  find ~/.claude -name "marketplace.json" 2>/dev/null
  find ~/.claude -name "*.json" | xargs grep -l '"plugins"' 2>/dev/null | head -5
  ```

  If found, read it. The schema is whatever you see.

- [ ] **Step 2: Check Claude Code docs or installed marketplace files**

  Look at `~/.claude/plugins/` for any subdirectory containing a `marketplace.json`.
  Also check: https://code.claude.com/docs/en/plugin-marketplaces.md (the URL the
  claude-code-guide agent referenced).

- [ ] **Step 3: Document the confirmed schema**

  If you find a real example, record it as a comment in `core/github_publisher.py`
  (which you will create in Task 2). If you cannot find documentation, use this
  placeholder shape and mark it with `# TODO: verify schema`:

  ```json
  {
    "name": "omnis",
    "description": "Omnis knowledge agents",
    "plugins": [
      {
        "name": "<agent-id>",
        "description": "...",
        "version": "1",
        "source": "https://github.com/<owner>/<repo>",
        "subdirectory": "agents/<agent-id>"
      }
    ]
  }
  ```

  No commit yet — this task is purely preparatory.

---

## Task 2: Create GitHubPublisher — core API client

**Files:**
- Create: `core/github_publisher.py`
- Create: `tests/test_github_publisher.py`

- [ ] **Step 1: Write failing tests for `_extract_description`**

  ```python
  # tests/test_github_publisher.py
  import pathlib
  import pytest
  from core.github_publisher import GitHubPublisher

  def _make_publisher():
      return GitHubPublisher(token="tok", repo="owner/repo")

  def test_extract_description_returns_first_non_heading_line(tmp_path):
      (tmp_path / "SOUL.md").write_text("# Agent Title\n\nFocus on trading systems.\n")
      pub = _make_publisher()
      assert pub._extract_description(tmp_path) == "Focus on trading systems."

  def test_extract_description_skips_blank_lines(tmp_path):
      (tmp_path / "SOUL.md").write_text("\n\n# Heading\n\nActual content here.\n")
      pub = _make_publisher()
      assert pub._extract_description(tmp_path) == "Actual content here."

  def test_extract_description_strips_bold_markers(tmp_path):
      (tmp_path / "SOUL.md").write_text("**Focus on** trading.\n")
      pub = _make_publisher()
      assert pub._extract_description(tmp_path) == "Focus on trading."

  def test_extract_description_truncates_to_200(tmp_path):
      (tmp_path / "SOUL.md").write_text("x" * 300 + "\n")
      pub = _make_publisher()
      assert len(pub._extract_description(tmp_path)) == 200

  def test_extract_description_missing_soul_returns_empty(tmp_path):
      pub = _make_publisher()
      assert pub._extract_description(tmp_path) == ""

  def test_extract_description_only_headings_returns_empty(tmp_path):
      (tmp_path / "SOUL.md").write_text("# Title\n## Subtitle\n")
      pub = _make_publisher()
      assert pub._extract_description(tmp_path) == ""
  ```

- [ ] **Step 2: Run tests — confirm they fail**

  ```bash
  cd C:/Users/DanielBaden/ai/omnis
  uv run pytest tests/test_github_publisher.py -v 2>&1 | head -20
  ```

  Expected: `ModuleNotFoundError: No module named 'core.github_publisher'`

- [ ] **Step 3: Implement `GitHubPublisher.__init__`, `from_env`, and `_extract_description`**

  ```python
  # core/github_publisher.py
  import json
  import logging
  import os
  import pathlib
  import re

  import httpx

  logger = logging.getLogger(__name__)

  # Confirmed marketplace.json schema:
  # (paste the schema you found in Task 1 here, or keep the TODO marker)
  # TODO: verify exact field names against Claude Code plugin marketplace docs.
  # Expected shape:
  # {
  #   "name": "omnis",
  #   "description": "Omnis knowledge agents",
  #   "plugins": [{"name", "description", "version", "source", "subdirectory"}]
  # }


  class GitHubPublisher:
      """Publishes Omnis agent plugins to a public GitHub repo via the Contents API.

      Reads from ~/.omnis/agents/<id>/ and upserts to agents/<id>/ in the configured
      GitHub repo. Regenerates marketplace.json at the repo root after each publish.
      """

      BASE_URL = "https://api.github.com"

      def __init__(self, token: str, repo: str, branch: str = "main"):
          self._token = token
          self._repo = repo
          self._branch = branch
          self._client = httpx.Client(
              headers={
                  "Authorization": f"Bearer {token}",
                  "Accept": "application/vnd.github+json",
                  "X-GitHub-Api-Version": "2022-11-28",
              },
              timeout=30,
          )

      @classmethod
      def from_env(cls) -> "GitHubPublisher | None":
          """Returns None if GITHUB_TOKEN or GITHUB_MARKETPLACE_REPO is absent."""
          token = os.environ.get("GITHUB_TOKEN")
          repo = os.environ.get("GITHUB_MARKETPLACE_REPO")
          if not token or not repo:
              return None
          branch = os.environ.get("GITHUB_MARKETPLACE_BRANCH", "main")
          return cls(token=token, repo=repo, branch=branch)

      def _extract_description(self, agent_dir: pathlib.Path) -> str:
          """Return the first non-blank, non-heading line of SOUL.md, stripped of
          markdown bold/italic markers, truncated to 200 chars.
          Returns '' if SOUL.md is missing or has no eligible line.
          Note: this is used only for marketplace.json — it does not affect agent file generation.
          """
          soul_path = agent_dir / "SOUL.md"
          if not soul_path.exists():
              return ""
          for line in soul_path.read_text("utf-8").splitlines():
              line = line.strip()
              if not line or line.startswith("#"):
                  continue
              # Strip bold/italic markers
              line = re.sub(r"[*_]{1,2}(.*?)[*_]{1,2}", r"\1", line)
              return line[:200]
          return ""
  ```

- [ ] **Step 4: Run tests — confirm they pass**

  ```bash
  uv run pytest tests/test_github_publisher.py -v -k "extract_description"
  ```

  Expected: 6 PASSED

- [ ] **Step 5: Commit**

  ```bash
  git add core/github_publisher.py tests/test_github_publisher.py
  git commit -m "feat: add GitHubPublisher skeleton with _extract_description"
  ```

---

## Task 3: GitHubPublisher — file collection and upsert

**Files:**
- Modify: `core/github_publisher.py`
- Modify: `tests/test_github_publisher.py`

- [ ] **Step 1: Write failing tests for `_collect_files` and `_upsert_file`**

  Append to `tests/test_github_publisher.py`:

  ```python
  import base64
  from unittest.mock import MagicMock, patch

  def _setup_agent_dir(tmp_path, agent_id="my-agent"):
      """Create a minimal agent dir with one cluster skill and required files.

      NOTE: digest lives at agent_dir/digest.md (written by consolidation),
      NOT at agent_dir/references/digest.md. _collect_files reads it from
      agent_dir/digest.md and publishes it to agents/<id>/references/digest.md
      in GitHub.
      """
      agent_dir = tmp_path / agent_id
      agent_dir.mkdir()
      (agent_dir / "SOUL.md").write_text("# My Agent\nFocus here.\n")
      (agent_dir / "digest.md").write_text("# Digest")   # ← agent_dir root, not references/
      skills = agent_dir / "skills" / "main-topic"
      skills.mkdir(parents=True)
      (skills / "SKILL.md").write_text("# Skill")
      agents = agent_dir / "agents"
      agents.mkdir()
      (agents / f"{agent_id}.md").write_text("# Agent def")
      hooks = agent_dir / "hooks"
      hooks.mkdir()
      (hooks / "hooks.json").write_text('{"SessionStart":[]}')
      (hooks / "inject-digest.js").write_text("// js")
      return agent_dir

  def test_collect_files_includes_all_required_paths(tmp_path):
      agent_id = "my-agent"
      agent_dir = _setup_agent_dir(tmp_path, agent_id)
      pub = _make_publisher()
      files = pub._collect_files(agent_id, agent_dir)
      assert f"agents/{agent_id}/skills/main-topic/SKILL.md" in files
      assert f"agents/{agent_id}/agents/{agent_id}.md" in files
      assert f"agents/{agent_id}/references/digest.md" in files
      assert f"agents/{agent_id}/hooks/hooks.json" in files
      assert f"agents/{agent_id}/hooks/inject-digest.js" in files
      assert f"agents/{agent_id}/plugin.json" in files

  def test_collect_files_excludes_mcp_json(tmp_path):
      agent_id = "my-agent"
      agent_dir = _setup_agent_dir(tmp_path, agent_id)
      (agent_dir / ".mcp.json").write_text("{}")
      pub = _make_publisher()
      files = pub._collect_files(agent_id, agent_dir)
      assert not any(".mcp.json" in k for k in files)

  def test_build_plugin_json_has_no_mcp_field(tmp_path):
      agent_id = "my-agent"
      agent_dir = _setup_agent_dir(tmp_path, agent_id)
      pub = _make_publisher()
      raw = pub._build_plugin_json(agent_id, agent_dir)
      data = json.loads(raw)
      assert "mcp" not in data
      assert data["name"] == f"omnis-{agent_id}"

  def test_upsert_file_creates_new_file(tmp_path):
      """When file doesn't exist, PUT without SHA."""
      pub = _make_publisher()
      mock_response_get = MagicMock()
      mock_response_get.status_code = 404
      mock_response_put = MagicMock()
      mock_response_put.raise_for_status = MagicMock()

      with patch.object(pub._client, "get", return_value=mock_response_get), \
           patch.object(pub._client, "put", return_value=mock_response_put) as mock_put:
          pub._upsert_file("agents/x/SKILL.md", "content")

      call_body = json.loads(mock_put.call_args[1]["content"])
      assert "sha" not in call_body
      assert base64.b64decode(call_body["content"]).decode() == "content"

  def test_upsert_file_updates_existing_file_with_sha(tmp_path):
      """When file exists, PUT includes the current SHA."""
      pub = _make_publisher()
      mock_response_get = MagicMock()
      mock_response_get.status_code = 200
      mock_response_get.json.return_value = {"sha": "abc123"}
      mock_response_put = MagicMock()
      mock_response_put.raise_for_status = MagicMock()

      with patch.object(pub._client, "get", return_value=mock_response_get), \
           patch.object(pub._client, "put", return_value=mock_response_put) as mock_put:
          pub._upsert_file("agents/x/SKILL.md", "new content")

      call_body = json.loads(mock_put.call_args[1]["content"])
      assert call_body["sha"] == "abc123"
  ```

- [ ] **Step 2: Run tests — confirm they fail**

  ```bash
  uv run pytest tests/test_github_publisher.py -v -k "collect or upsert or plugin_json" 2>&1 | tail -15
  ```

  Expected: AttributeError or similar — methods not yet implemented.

- [ ] **Step 3: Implement `_collect_files`, `_build_plugin_json`, `_upsert_file`**

  Add to `GitHubPublisher` in `core/github_publisher.py`:

  ```python
  import base64  # add to imports at top

  def _collect_files(self, agent_id: str, agent_dir: pathlib.Path) -> dict[str, str]:
      """Return {github_path: utf-8 content} for all files to publish."""
      prefix = f"agents/{agent_id}"
      files: dict[str, str] = {}

      # Cluster skills
      skills_dir = agent_dir / "skills"
      if skills_dir.exists():
          for cluster_dir in sorted(skills_dir.iterdir()):
              if cluster_dir.is_dir():
                  skill_file = cluster_dir / "SKILL.md"
                  if skill_file.exists():
                      files[f"{prefix}/skills/{cluster_dir.name}/SKILL.md"] = (
                          skill_file.read_text("utf-8")
                      )

      # Agent definition
      agent_file = agent_dir / "agents" / f"{agent_id}.md"
      if agent_file.exists():
          files[f"{prefix}/agents/{agent_id}.md"] = agent_file.read_text("utf-8")

      # Digest reference — reads from agent_dir/digest.md (written by consolidation),
      # published into the references/ subdirectory in GitHub for plugin hook compatibility.
      digest = agent_dir / "digest.md"
      if digest.exists():
          files[f"{prefix}/references/digest.md"] = digest.read_text("utf-8")

      # Hooks (safe to distribute — inject-digest.js uses CLAUDE_PLUGIN_ROOT env var)
      for hook_file in ["hooks.json", "inject-digest.js"]:
          src = agent_dir / "hooks" / hook_file
          if src.exists():
              files[f"{prefix}/hooks/{hook_file}"] = src.read_text("utf-8")

      # Generated plugin.json (no mcp field)
      files[f"{prefix}/plugin.json"] = self._build_plugin_json(agent_id, agent_dir)

      return files

  def _build_plugin_json(self, agent_id: str, agent_dir: pathlib.Path) -> str:
      """Generate plugin.json manifest for GitHub distribution (no mcp field)."""
      version_file = agent_dir / "plugin_version.txt"
      version = version_file.read_text("utf-8").strip() if version_file.exists() else "1"
      manifest = {
          "name": f"omnis-{agent_id}",
          "version": version,
          "description": f"Knowledge agent for {agent_id}",
          "author": "Omnis",
          "hooks": "./hooks/hooks.json",
      }
      return json.dumps(manifest, indent=2)

  def _upsert_file(self, path: str, content: str) -> None:
      """Create or update a file in the GitHub repo via the Contents API."""
      url = f"{self.BASE_URL}/repos/{self._repo}/contents/{path}"

      # Fetch current SHA if file exists (required for updates)
      get_resp = self._client.get(url, params={"ref": self._branch})
      sha = get_resp.json().get("sha") if get_resp.status_code == 200 else None

      body: dict = {
          "message": f"chore: update {path}",
          "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
          "branch": self._branch,
      }
      if sha:
          body["sha"] = sha

      put_resp = self._client.put(url, content=json.dumps(body))
      put_resp.raise_for_status()
  ```

- [ ] **Step 4: Run tests — confirm they pass**

  ```bash
  uv run pytest tests/test_github_publisher.py -v
  ```

  Expected: All tests PASSED.

- [ ] **Step 5: Commit**

  ```bash
  git add core/github_publisher.py tests/test_github_publisher.py
  git commit -m "feat: add GitHubPublisher file collection and upsert"
  ```

---

## Task 4: GitHubPublisher — publish and marketplace.json

**Files:**
- Modify: `core/github_publisher.py`
- Modify: `tests/test_github_publisher.py`

- [ ] **Step 1: Write failing tests for `_regenerate_marketplace` and `publish`**

  Append to `tests/test_github_publisher.py`:

  ```python
  def test_regenerate_marketplace_creates_new_when_missing(tmp_path):
      pub = _make_publisher()
      mock_get = MagicMock()
      mock_get.status_code = 404

      with patch.object(pub._client, "get", return_value=mock_get), \
           patch.object(pub, "_upsert_file") as mock_upsert:
          pub._regenerate_marketplace("my-agent", "2", "Focus here.")

      assert mock_upsert.called
      written = json.loads(mock_upsert.call_args[0][1])
      plugin = next(p for p in written["plugins"] if p["name"] == "my-agent")
      assert plugin["version"] == "2"
      assert plugin["description"] == "Focus here."

  def test_regenerate_marketplace_upserts_existing_entry(tmp_path):
      pub = _make_publisher()
      existing = {
          "name": "omnis",
          "plugins": [
              {"name": "other-agent", "version": "1", "description": "other"},
              {"name": "my-agent", "version": "1", "description": "old"},
          ]
      }
      import base64
      encoded = base64.b64encode(json.dumps(existing).encode()).decode()

      mock_get = MagicMock()
      mock_get.status_code = 200
      mock_get.json.return_value = {"sha": "oldsha", "content": encoded}

      with patch.object(pub._client, "get", return_value=mock_get), \
           patch.object(pub, "_upsert_file") as mock_upsert:
          pub._regenerate_marketplace("my-agent", "3", "new desc")

      written = json.loads(mock_upsert.call_args[0][1])
      # other-agent preserved, my-agent updated
      assert len(written["plugins"]) == 2
      my = next(p for p in written["plugins"] if p["name"] == "my-agent")
      assert my["version"] == "3"
      assert my["description"] == "new desc"

  def test_publish_calls_upsert_for_all_collected_files(tmp_path):
      agent_id = "my-agent"
      agent_dir = _setup_agent_dir(tmp_path, agent_id)
      pub = _make_publisher()

      with patch.object(pub, "_upsert_file") as mock_upsert, \
           patch.object(pub, "_regenerate_marketplace"):
          pub.publish(agent_id, agent_dir, version="5")

      paths_uploaded = [call[0][0] for call in mock_upsert.call_args_list]
      assert any("SKILL.md" in p for p in paths_uploaded)
      assert any("plugin.json" in p for p in paths_uploaded)
      assert not any(".mcp.json" in p for p in paths_uploaded)

  def test_publish_calls_regenerate_marketplace(tmp_path):
      agent_id = "my-agent"
      agent_dir = _setup_agent_dir(tmp_path, agent_id)
      pub = _make_publisher()

      with patch.object(pub, "_upsert_file"), \
           patch.object(pub, "_regenerate_marketplace") as mock_regen:
          pub.publish(agent_id, agent_dir, version="5")

      mock_regen.assert_called_once_with("my-agent", "5", pub._extract_description(agent_dir))
  ```

- [ ] **Step 2: Run tests — confirm they fail**

  ```bash
  uv run pytest tests/test_github_publisher.py -v -k "regenerate or publish" 2>&1 | tail -15
  ```

- [ ] **Step 3: Implement `_regenerate_marketplace` and `publish`**

  Add to `GitHubPublisher`:

  ```python
  def _regenerate_marketplace(self, agent_id: str, version: str, description: str) -> None:
      """Merge-update marketplace.json at repo root.

      Fetches current file, upserts the entry for agent_id by name match, writes back.
      Schema: {"name": "omnis", "description": "...", "plugins": [{name, description, version,
               source, subdirectory}]}
      TODO: verify exact field names against Claude Code plugin marketplace docs.
      """
      url = f"{self.BASE_URL}/repos/{self._repo}/contents/marketplace.json"
      get_resp = self._client.get(url, params={"ref": self._branch})

      if get_resp.status_code == 200:
          raw = base64.b64decode(get_resp.json()["content"]).decode("utf-8")
          marketplace = json.loads(raw)
      else:
          marketplace = {"name": "omnis", "description": "Omnis knowledge agents", "plugins": []}

      entry = {
          "name": agent_id,
          "description": description,
          "version": version,
          "source": f"https://github.com/{self._repo}",
          "subdirectory": f"agents/{agent_id}",
      }

      plugins = marketplace.setdefault("plugins", [])
      for i, p in enumerate(plugins):
          if p.get("name") == agent_id:
              plugins[i] = entry
              break
      else:
          plugins.append(entry)

      self._upsert_file("marketplace.json", json.dumps(marketplace, indent=2))

  def publish(self, agent_id: str, agent_dir: pathlib.Path, version: str) -> None:
      """Push plugin snapshot for one agent and update marketplace.json."""
      if not plugin_output_exists(agent_dir):
          logger.info(f"[{agent_id}] No skills to publish — skipping GitHub push")
          return

      files = self._collect_files(agent_id, agent_dir)
      for path, content in files.items():
          logger.debug(f"Upserting {path}")
          self._upsert_file(path, content)

      description = self._extract_description(agent_dir)
      self._regenerate_marketplace(agent_id, version, description)


# NOTE: module-level helper — place OUTSIDE the GitHubPublisher class body, after the class.
def plugin_output_exists(agent_dir: pathlib.Path) -> bool:
    """True if the agent dir has at least one cluster skill to publish."""
    skills_dir = agent_dir / "skills"
    return skills_dir.exists() and any(
        (d / "SKILL.md").exists() for d in skills_dir.iterdir() if d.is_dir()
    )
  ```

- [ ] **Step 4: Run all publisher tests**

  ```bash
  uv run pytest tests/test_github_publisher.py -v
  ```

  Expected: All PASSED.

- [ ] **Step 5: Commit**

  ```bash
  git add core/github_publisher.py tests/test_github_publisher.py
  git commit -m "feat: add GitHubPublisher publish and marketplace.json merge"
  ```

---

## Task 5: Strip PluginWriter's plugin cache writes

**Files:**
- Modify: `core/skill_writer.py`
- Modify: `tests/test_skill_writer.py`

- [ ] **Step 1: Delete the now-invalid cache-write tests and add replacement tests**

  In `tests/test_skill_writer.py`, delete these four tests (they assert behaviour we're removing):
  - `test_write_skill_copies_to_correct_claude_skills_path`
  - `test_write_skill_registers_plugin_in_installed_plugins`
  - `test_write_skill_updates_last_updated_on_refresh`
  - `test_write_skill_creates_installed_plugins_if_missing`

  Add these replacements:

  ```python
  def test_plugin_writer_returns_tuple_with_version(tmp_path):
      """write() must return (skill_changed: bool, version: str)."""
      from core.skill_writer import PluginWriter
      from core.models.types import PluginOutput, SkillSpec
      agent_dir = tmp_path / "my-agent"
      agent_dir.mkdir()
      (agent_dir / "SOUL.md").write_text("# Agent\nFocus.")
      output = PluginOutput(agent_id="my-agent", skills=[
          SkillSpec(name="main", content="# Skill content")
      ])
      pw = PluginWriter(agent_dir)
      result = pw.write(output)
      assert isinstance(result, tuple) and len(result) == 2
      changed, version = result
      assert isinstance(changed, bool)
      assert isinstance(version, str)

  def test_plugin_writer_does_not_write_to_claude_cache(tmp_path):
      """After cleanup, PluginWriter must NOT touch ~/.claude/plugins/cache/."""
      from core.skill_writer import PluginWriter
      from core.models.types import PluginOutput, SkillSpec
      agent_dir = tmp_path / "my-agent"
      agent_dir.mkdir()
      (agent_dir / "SOUL.md").write_text("# Agent\nFocus.")
      output = PluginOutput(agent_id="my-agent", skills=[
          SkillSpec(name="main", content="# Skill content")
      ])
      with patch("core.skill_writer.pathlib.Path.home", return_value=tmp_path):
          pw = PluginWriter(agent_dir)
          pw.write(output)
      cache = tmp_path / ".claude" / "plugins" / "cache"
      assert not cache.exists(), "PluginWriter must not write to claude plugin cache"

  def test_plugin_writer_does_not_create_installed_plugins(tmp_path):
      """PluginWriter must not touch installed_plugins.json."""
      from core.skill_writer import PluginWriter
      from core.models.types import PluginOutput, SkillSpec
      agent_dir = tmp_path / "my-agent"
      agent_dir.mkdir()
      (agent_dir / "SOUL.md").write_text("# Agent\nFocus.")
      output = PluginOutput(agent_id="my-agent", skills=[
          SkillSpec(name="main", content="# Skill content")
      ])
      with patch("core.skill_writer.pathlib.Path.home", return_value=tmp_path):
          pw = PluginWriter(agent_dir)
          pw.write(output)
      installed = tmp_path / ".claude" / "plugins" / "installed_plugins.json"
      assert not installed.exists()
  ```

- [ ] **Step 2: Run tests — confirm new tests fail, existing pass**

  ```bash
  uv run pytest tests/test_skill_writer.py -v 2>&1 | tail -20
  ```

  Expected: new tests FAIL (cache still being written), existing tests still PASS.

- [ ] **Step 3: Remove plugin cache code from `PluginWriter.write()`**

  In `core/skill_writer.py`, in `PluginWriter.write()`:

  1. Delete the `install_path` variable and everything that references it (lines ~216–306
     covering: `install_path` construction, `plugin_skills_dir` mirror, `manifest_dir`/
     `plugin.json` write, `hooks_dir` creation + `hooks.json` + `inject_js` writes, `mcp_json`
     + `.mcp.json` write, `refs_dir` + digest copy to cache, `_write_agent_file` call with
     `install_path`).

  2. Keep: `agent_skills_dir` writes (source of truth in `~/.omnis/agents/<id>/skills/`),
     the `_write_agent_file` call rewritten to write only to `agent_dir/agents/` (remove the
     mirror block from that method too — see below), `_write_local_skill()`, and the
     `version_file.write_text(version)` line.

  3. Change return statement: `return changed` → `return changed, version`.

  4. In `_write_agent_file()`: remove the "Mirror to plugin cache" block (the
     `plugin_agents_dir` creation and write). The method should only write to
     `agent_dir/agents/{agent_id}.md`.

  5. Delete the `_register_plugin()` method from `PluginWriter` entirely.

  6. Also remove the `import shutil` if it becomes unused (check — `shutil.rmtree` is still
     used for `agent_skills_dir`; keep the import).

- [ ] **Step 4: Run tests**

  ```bash
  uv run pytest tests/test_skill_writer.py -v
  ```

  Expected: All PASSED (including the new no-cache tests).

- [ ] **Step 5: Commit**

  ```bash
  git add core/skill_writer.py tests/test_skill_writer.py
  git commit -m "refactor: remove PluginWriter plugin cache writes; return (changed, version)"
  ```

---

## Task 6: Strip SkillWriter's plugin cache writes

**Files:**
- Modify: `core/skill_writer.py`
- Modify: `tests/test_skill_writer.py`

- [ ] **Step 1: Add failing tests asserting SkillWriter no longer writes to cache**

  Append to `tests/test_skill_writer.py`:

  ```python
  def test_skill_writer_does_not_write_to_claude_cache(tmp_path):
      agent_dir = tmp_path / "agents" / "trading"
      agent_dir.mkdir(parents=True)
      with patch("core.skill_writer.pathlib.Path.home", return_value=tmp_path):
          sw = SkillWriter(agent_dir)
          sw.write("# Skill", agent_id="trading")
      cache = tmp_path / ".claude" / "plugins" / "cache"
      assert not cache.exists()

  def test_skill_writer_revert_does_not_write_to_claude_cache(tmp_path):
      agent_dir = tmp_path / "agents" / "trading"
      agent_dir.mkdir(parents=True)
      # Set up a previous skill and a skills dir (needed for revert)
      (agent_dir / "SKILL.md").write_text("# Current")
      (agent_dir / "SKILL.previous.md").write_text("# Previous")
      skills_dir = agent_dir / "skills" / "main"
      skills_dir.mkdir(parents=True)
      (skills_dir / "SKILL.md").write_text("# Cluster skill")
      (agent_dir / "plugin_version.txt").write_text("3")

      with patch("core.skill_writer.pathlib.Path.home", return_value=tmp_path):
          sw = SkillWriter(agent_dir)
          sw.revert_to_previous("trading")

      cache = tmp_path / ".claude" / "plugins" / "cache"
      assert not cache.exists()
  ```

- [ ] **Step 2: Run tests — confirm new tests fail**

  ```bash
  uv run pytest tests/test_skill_writer.py -v -k "skill_writer_does_not" 2>&1 | tail -10
  ```

- [ ] **Step 3: Remove plugin cache code from `SkillWriter`**

  In `core/skill_writer.py`, in `SkillWriter.write()`:
  - Delete lines ~70–87: the `install_path` block (cache dir creation, SKILL.md copy there,
    refs copy there) and the `self._register_plugin(install_path)` call.

  In `SkillWriter.revert_to_previous()`:
  - Delete lines ~136–145: the `version_file`/`install_path` block that writes to the cache.

  Delete `SkillWriter._register_plugin()` method entirely (lines ~149–176).

  At this point `SkillWriter` no longer calls `shutil` at all — the only `shutil.copy2`
  call (copying digest to the cache's refs dir, line ~85) was inside the block being
  deleted. **Remove the `import shutil` line from `skill_writer.py`** (verify `PluginWriter`
  still uses `shutil.rmtree` for `agent_skills_dir` — it does, so the import is still
  needed at the module level for `PluginWriter`. Only remove if you confirm `SkillWriter`
  was the sole user.)

  Also remove the `_PLUGIN_KEY` module-level constant from `skill_writer.py` — it was
  only used by `SkillWriter._register_plugin()`, which is now deleted.

- [ ] **Step 4: Run all skill_writer tests**

  ```bash
  uv run pytest tests/test_skill_writer.py -v
  ```

  Expected: All PASSED. The four old plugin-registration tests were deleted in Task 5.

- [ ] **Step 5: Run full suite to check for regressions**

  ```bash
  uv run pytest --tb=short -q 2>&1 | tail -20
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add core/skill_writer.py tests/test_skill_writer.py
  git commit -m "refactor: remove SkillWriter plugin cache writes and _register_plugin"
  ```

---

## Task 7: Remove Registry from consolidation and wire GitHubPublisher

**Files:**
- Modify: `core/consolidation.py`
- Modify: `tests/test_consolidation.py`

- [ ] **Step 1: Update consolidation tests**

  In `tests/test_consolidation.py`, in `test_consolidation_generates_digest_when_inbox_has_items`
  and `test_consolidation_clears_inbox_after_run`, remove `patch("core.consolidation.Registry")`
  from the `with patch(...)` blocks (Registry is being removed). Add a publisher mock and set
  the PluginWriter return value to a tuple (required after the return type change in Task 5):

  ```python
  # In both tests, replace:
  with patch("core.consolidation.PluginWriter"), \
       patch("core.consolidation.Registry"):

  # With:
  with patch("core.consolidation.PluginWriter") as mock_pw_cls, \
       patch("core.consolidation.GitHubPublisher") as mock_gh_cls:
      mock_pw_cls.return_value.write.return_value = (False, "1")
      mock_gh_cls.from_env.return_value = None  # publisher disabled
  ```

  Add two new tests:

  ```python
  def test_consolidation_calls_github_publisher_when_configured(tmp_path, mocker):
      (tmp_path / "INBOX.md").write_text("## entry\ncontent here")
      (tmp_path / "knowledge").mkdir()

      mock_provider = MagicMock()
      mock_provider.consolidate.return_value = ConsolidationResult(updated_files=[], created_files=[])
      mock_provider.generate_digest.return_value = "# Digest"
      mock_provider.generate_plugin_skills.return_value.skills = []

      mock_publisher = MagicMock()

      with patch("core.consolidation.PluginWriter") as mock_pw_cls, \
           patch("core.consolidation.GitHubPublisher") as mock_gh_cls:
          mock_pw_cls.return_value.write.return_value = (False, "1")
          mock_gh_cls.from_env.return_value = mock_publisher

          pipeline = ConsolidationPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
          pipeline.run()

      mock_publisher.publish.assert_called_once()

  def test_consolidation_skips_publisher_when_not_configured(tmp_path):
      (tmp_path / "INBOX.md").write_text("## entry\ncontent")
      (tmp_path / "knowledge").mkdir()

      mock_provider = MagicMock()
      mock_provider.consolidate.return_value = ConsolidationResult(updated_files=[], created_files=[])
      mock_provider.generate_digest.return_value = "# Digest"
      mock_provider.generate_plugin_skills.return_value.skills = []

      with patch("core.consolidation.PluginWriter") as mock_pw_cls, \
           patch("core.consolidation.GitHubPublisher") as mock_gh_cls:
          mock_pw_cls.return_value.write.return_value = (False, "1")
          mock_gh_cls.from_env.return_value = None  # not configured

          pipeline = ConsolidationPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
          pipeline.run()
          # Just must not raise
  ```

- [ ] **Step 2: Run tests — confirm new tests fail, updated tests pass**

  ```bash
  uv run pytest tests/test_consolidation.py -v 2>&1 | tail -20
  ```

  Expected: the two new publisher tests FAIL (GitHubPublisher not yet in consolidation.py),
  the two updated existing tests PASS (they now have the tuple mock set correctly).

- [ ] **Step 3: Update `consolidation.py`**

  **Add top-level import** near the other `core.*` imports at the top of the file:
  ```python
  from core.github_publisher import GitHubPublisher
  ```
  This is required so `patch("core.consolidation.GitHubPublisher")` works in tests.

  **Remove from both `run()` and `run_reevaluation()`:**
  ```python
  reg = Registry(DATA_DIR / "registry.json")
  reg.register(self._config.agent_id, self._dir / "SKILL.md")
  reg.save()
  ```

  **Remove at top of file (if no longer used anywhere):**
  ```python
  from core.registry import Registry
  ```
  (grep to confirm no other use before deleting).

  **In `run()`, update PluginWriter call:**
  ```python
  # Before:
  skill_changed = pw.write(plugin_output)
  # After:
  skill_changed, version = pw.write(plugin_output)
  ```

  **In `run()`, add publisher block** after `skill_changed, version = pw.write(...)`:
  ```python
  try:
      publisher = GitHubPublisher.from_env()
      if publisher:
          job_status.log(agent_id, task, "Publishing to GitHub marketplace…")
          publisher.publish(agent_id, self._dir, version)
          job_status.log(agent_id, task, "GitHub marketplace updated")
  except Exception as e:
      logger.warning(f"[{agent_id}] GitHub publish failed (non-fatal): {e}")
  ```

  **In `run_reevaluation()`**, update the `pw.write()` call to unpack `(_, version)` and add
  the same publisher block (no local import needed — `GitHubPublisher` is now a top-level
  import).

- [ ] **Step 4: Run all tests**

  ```bash
  uv run pytest --tb=short -q
  ```

  Expected: All PASSED.

- [ ] **Step 5: Commit**

  ```bash
  git add core/consolidation.py tests/test_consolidation.py
  git commit -m "feat: wire GitHubPublisher into consolidation; remove Registry writes"
  ```

---

## Task 8: Final cleanup and smoke test

**Files:**
- Modify: `.env.example` (add new env vars)

- [ ] **Step 1: Add env var documentation**

  Add to `.env.example`:

  ```bash
  # GitHub Marketplace (optional — omit to disable publishing)
  GITHUB_TOKEN=ghp_...
  GITHUB_MARKETPLACE_REPO=owner/omnis-plugins
  GITHUB_MARKETPLACE_BRANCH=main
  ```

- [ ] **Step 2: Run full test suite**

  ```bash
  uv run pytest -v 2>&1 | tail -30
  ```

  Expected: All PASSED. Note any failures and fix before proceeding.

- [ ] **Step 3: Manual smoke test — verify publisher works end-to-end**

  Set real credentials in `.env.local` (not committed):
  ```bash
  GITHUB_TOKEN=<your PAT>
  GITHUB_MARKETPLACE_REPO=<your-user>/omnis-plugins
  ```

  Then trigger a consolidation for one agent (must have non-empty INBOX.md):
  ```bash
  curl -X POST http://localhost:8420/api/scheduler/trigger/<agent-id>/consolidate
  curl http://localhost:8420/api/scheduler/activity
  ```

  Check the activity panel for "Publishing to GitHub marketplace…" and "GitHub marketplace updated".
  Verify `agents/<agent-id>/` appears in the GitHub repo and `marketplace.json` is present.

- [ ] **Step 4: Add marketplace.json schema TODO note if schema is still unconfirmed**

  If the marketplace.json schema could not be verified in Task 1, ensure the TODO comment
  remains in `core/github_publisher.py:_regenerate_marketplace()` so it is not forgotten.

- [ ] **Step 5: Commit env.example and any final fixes**

  ```bash
  git add .env.example
  git commit -m "docs: add GitHub marketplace env vars to .env.example"
  ```
