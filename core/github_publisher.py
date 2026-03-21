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
        raise NotImplementedError

    def _collect_files(self, agent_id: str, agent_dir: pathlib.Path) -> dict[str, str]:
        raise NotImplementedError

    def _build_plugin_json(self, agent_id: str, agent_dir: pathlib.Path) -> str:
        raise NotImplementedError

    def _upsert_file(self, path: str, content: str) -> None:
        raise NotImplementedError

    def _regenerate_marketplace(self, agent_id: str, version: str, description: str) -> None:
        raise NotImplementedError

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
