import json
import pathlib
from datetime import datetime, timezone

from core.constants import APP_NAME

_PLUGIN_KEY = f"{APP_NAME}@{APP_NAME}"
_PLUGIN_VERSION = "1.0.0"


class SkillWriter:
    def __init__(self, agent_dir: pathlib.Path):
        self._agent_dir = agent_dir

    def write(self, skill_content: str, agent_id: str) -> pathlib.Path:
        # Local copy inside the agent directory
        local = self._agent_dir / "SKILL.md"
        local.write_text(skill_content, encoding="utf-8")

        # Global copy in the Claude Code plugin cache — correct discoverable path:
        # ~/.claude/plugins/cache/{APP_NAME}/{APP_NAME}/{version}/skills/{agent_id}/SKILL.md
        install_path = (
            pathlib.Path.home()
            / ".claude" / "plugins" / "cache"
            / APP_NAME / APP_NAME / _PLUGIN_VERSION
        )
        skill_dir = install_path / "skills" / agent_id
        skill_dir.mkdir(parents=True, exist_ok=True)
        (skill_dir / "SKILL.md").write_text(skill_content, encoding="utf-8")

        self._register_plugin(install_path)

        return local

    def _register_plugin(self, install_path: pathlib.Path) -> None:
        plugins_file = (
            pathlib.Path.home() / ".claude" / "plugins" / "installed_plugins.json"
        )
        plugins_file.parent.mkdir(parents=True, exist_ok=True)

        if plugins_file.exists():
            data = json.loads(plugins_file.read_text(encoding="utf-8"))
        else:
            data = {"version": 2, "plugins": {}}

        now = datetime.now(timezone.utc).isoformat()
        install_path_str = str(install_path)

        if _PLUGIN_KEY in data["plugins"]:
            data["plugins"][_PLUGIN_KEY][0]["lastUpdated"] = now
        else:
            data["plugins"][_PLUGIN_KEY] = [
                {
                    "scope": "user",
                    "installPath": install_path_str,
                    "version": _PLUGIN_VERSION,
                    "installedAt": now,
                    "lastUpdated": now,
                }
            ]

        plugins_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
