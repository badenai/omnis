import difflib
import json
import pathlib
import re
import shutil
from datetime import datetime, timezone

from core.constants import APP_NAME

_PLUGIN_KEY = f"{APP_NAME}@{APP_NAME}"
_PLUGIN_VERSION = "1.0.0"


def _sanitize_structure(content: str) -> str:
    """Strip known structural anti-patterns that reduce audit score.

    Applied as a post-processing pass after LLM generation — catches anything
    that slips through despite the prompt instructions.
    """
    # Remove 'Announce at start: ...' lines (audit criterion: announce_at_start)
    content = re.sub(r'^\s*Announce at start:.*\n?', '', content, flags=re.MULTILINE)
    # Remove '*Knowledge last updated: ...*' timestamp lines (criterion: knowledge_date_line)
    content = re.sub(r'^\s*\*Knowledge last updated:.*\*\s*\n?', '', content, flags=re.MULTILINE)
    # Remove '## When to Use' sections if Gemini adds them anyway (criterion: when_to_use_in_body)
    content = re.sub(r'^#{1,3} When to Use\n(?:(?!^#).|\n)*', '', content, flags=re.MULTILINE)
    return content


def _sanitize_yaml_fence(content: str) -> str:
    """Strip erroneous code fence around YAML frontmatter if present.

    Only matches at the absolute start of the string (^ without MULTILINE),
    so mid-document ```yaml``` blocks in the content body are never touched.
    """
    return re.sub(
        r'^```(?:yaml)?\s*\n(---\n(?:(?!---\n```).)*\n---)\n```\s*',
        r'\1\n',
        content,
        count=1,
        flags=re.DOTALL,
    )


class SkillWriter:
    def __init__(self, agent_dir: pathlib.Path):
        self._agent_dir = agent_dir

    def write(self, skill_content: str, agent_id: str) -> bool:
        skill_content = _sanitize_yaml_fence(skill_content)
        skill_content = _sanitize_structure(skill_content)

        # Append knowledge base section referencing bundled references
        knowledge_section = (
            "\n\n## Knowledge Base\n"
            "When detailed knowledge context is needed, read `references/digest.md` for the full knowledge digest."
        )
        skill_content = skill_content.rstrip() + knowledge_section

        # Local copy inside the agent directory
        local = self._agent_dir / "SKILL.md"

        # Read existing before overwrite
        previous_content = local.read_text("utf-8") if local.exists() else None

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

        # Bundle reference files for progressive disclosure
        refs_dir = skill_dir / "references"
        refs_dir.mkdir(exist_ok=True)
        digest_src = self._agent_dir / "digest.md"
        if digest_src.exists():
            shutil.copy2(digest_src, refs_dir / "digest.md")

        self._register_plugin(install_path)

        # Compute diff
        if previous_content is None:
            changed = True  # first run, nothing to diff
        elif previous_content == skill_content:
            changed = False  # identical, no diff written
        else:
            changed = True
            (self._agent_dir / "SKILL.previous.md").write_text(previous_content, "utf-8")
            diff = difflib.unified_diff(
                previous_content.splitlines(keepends=True),
                skill_content.splitlines(keepends=True),
                fromfile="SKILL.previous.md",
                tofile="SKILL.md",
            )
            (self._agent_dir / "SKILL.diff").write_text("".join(diff), "utf-8")

        return changed

    def revert_to_previous(self, agent_id: str) -> bool:
        """Revert SKILL.md to its previous version.

        Saves the current (rejected) skill to SKILL.rejected.md for analysis,
        then restores SKILL.previous.md as the active skill in both the agent
        directory and the plugin cache.

        Returns True on success, False if SKILL.previous.md does not exist.
        """
        previous_path = self._agent_dir / "SKILL.previous.md"
        if not previous_path.exists():
            return False

        current_path = self._agent_dir / "SKILL.md"
        if current_path.exists():
            (self._agent_dir / "SKILL.rejected.md").write_text(
                current_path.read_text("utf-8"), "utf-8"
            )

        previous_content = previous_path.read_text("utf-8")
        current_path.write_text(previous_content, "utf-8")

        # Mirror to plugin cache (same path as write())
        install_path = (
            pathlib.Path.home()
            / ".claude" / "plugins" / "cache"
            / APP_NAME / APP_NAME / _PLUGIN_VERSION
        )
        skill_dir = install_path / "skills" / agent_id
        skill_dir.mkdir(parents=True, exist_ok=True)
        (skill_dir / "SKILL.md").write_text(previous_content, "utf-8")

        return True

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
