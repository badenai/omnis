# GitHubPublisher — pushes agent plugin files to a public GitHub repo
# for the Claude Code plugin marketplace.
#
# Confirmed marketplace.json schema:
# {
#   "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
#   "name": "omnis",
#   "description": "Omnis knowledge agents",
#   "owner": {"name": "Omnis"},
#   "plugins": [
#     {
#       "name": "omnis-<agent-id>",
#       "description": "<from SOUL.md>",
#       "version": "<version string>",
#       "author": {"name": "Omnis"},
#       "category": "productivity",
#       "source": {
#         "source": "git-subdir",
#         "url": "https://github.com/<owner>/<repo>.git",
#         "path": "agents/<agent-id>",
#         "ref": "main"
#       }
#     }
#   ]
# }

import base64
import json
import logging
import os
import pathlib
import re

import httpx

logger = logging.getLogger(__name__)


class GitHubPublisher:
    BASE_URL = "https://api.github.com"

    def __init__(self, token: str, repo: str, branch: str = "main") -> None:
        self._repo = repo
        self._branch = branch
        self._client = httpx.Client(
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            }
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

    def publish(self, agent_id: str, agent_dir: pathlib.Path, version: str) -> None:
        """Push plugin snapshot for one agent and update marketplace.json."""
        if not plugin_output_exists(agent_dir):
            logger.info("[%s] No skills to publish — skipping GitHub push", agent_id)
            return

        files = self._collect_files(agent_id, agent_dir)
        for path, content in files.items():
            logger.debug("Upserting %s", path)
            self._upsert_file(path, content)

        description = self._extract_description(agent_dir)
        self._regenerate_marketplace(agent_id, version, description)

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

        # Digest — reads from agent_dir/digest.md (root level), published to references/ in GitHub
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

        put_resp = self._client.put(url, json=body)
        put_resp.raise_for_status()

    def _regenerate_marketplace(self, agent_id: str, version: str, description: str) -> None:
        """Merge-update marketplace.json at repo root."""
        url = f"{self.BASE_URL}/repos/{self._repo}/contents/marketplace.json"
        get_resp = self._client.get(url, params={"ref": self._branch})

        if get_resp.status_code == 200:
            raw = base64.b64decode(get_resp.json()["content"]).decode("utf-8")
            marketplace = json.loads(raw)
        elif get_resp.status_code == 404:
            marketplace = {
                "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
                "name": "omnis",
                "description": "Omnis knowledge agents",
                "owner": {"name": "Omnis"},
                "plugins": [],
            }
        else:
            get_resp.raise_for_status()

        marketplace.setdefault("$schema", "https://anthropic.com/claude-code/marketplace.schema.json")

        entry = {
            "name": agent_id,
            "description": description,
            "version": version,
            "author": {"name": "Omnis"},
            "category": "productivity",
            "source": {
                "source": "git-subdir",
                "url": f"https://github.com/{self._repo}.git",
                "path": f"agents/{agent_id}",
                "ref": self._branch,
            },
        }

        plugins = marketplace.setdefault("plugins", [])
        for i, p in enumerate(plugins):
            if p.get("name") == agent_id:
                plugins[i] = entry
                break
        else:
            plugins.append(entry)

        self._upsert_file("marketplace.json", json.dumps(marketplace, indent=2))

    def _extract_description(self, agent_dir: pathlib.Path) -> str:
        """Read SOUL.md, return first non-blank, non-heading line, stripped of bold/italic markers,
        truncated to 200 chars. Returns '' if SOUL.md missing or no eligible line."""
        soul = agent_dir / "SOUL.md"
        if not soul.exists():
            return ""
        for line in soul.read_text("utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            # Also strip markers that may be embedded at word boundaries (e.g. **word**)
            cleaned = stripped
            cleaned = re.sub(r"\*\*(.*?)\*\*", r"\1", cleaned)
            cleaned = re.sub(r"\*(.*?)\*", r"\1", cleaned)
            cleaned = re.sub(r"__(.*?)__", r"\1", cleaned)
            cleaned = re.sub(r"_(.*?)_", r"\1", cleaned)
            return cleaned[:200]
        return ""


def plugin_output_exists(agent_dir: pathlib.Path) -> bool:
    """True if the agent dir has at least one cluster skill to publish."""
    skills_dir = agent_dir / "skills"
    return skills_dir.exists() and any(
        (d / "SKILL.md").exists() for d in skills_dir.iterdir() if d.is_dir()
    )
