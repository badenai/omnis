import difflib
import json
import pathlib
import re
import shutil
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from core.constants import APP_NAME, PLUGIN_VERSION

if TYPE_CHECKING:
    from core.models.types import PluginOutput

_PLUGIN_KEY = f"{APP_NAME}@{APP_NAME}"


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

        # Global copy in the Claude Code plugin cache
        install_path = (
            pathlib.Path.home()
            / ".claude" / "plugins" / "cache"
            / APP_NAME / APP_NAME / PLUGIN_VERSION
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

        # Mirror to agent_dir/skills/{primary} and plugin cache.
        primary_path_file = self._agent_dir / "primary_skill_path.txt"
        if primary_path_file.exists():
            primary_agent_path = pathlib.Path(primary_path_file.read_text("utf-8").strip())
            primary_agent_path.parent.mkdir(parents=True, exist_ok=True)
            primary_agent_path.write_text(previous_content, "utf-8")
            # Mirror to plugin cache via plugin_install_path.txt
            install_path_file = self._agent_dir / "plugin_install_path.txt"
            if install_path_file.exists():
                install_path = pathlib.Path(install_path_file.read_text("utf-8").strip())
                cluster_name = primary_agent_path.parent.name
                plugin_cache_path = install_path / "skills" / cluster_name / "SKILL.md"
                if plugin_cache_path.parent.exists():
                    plugin_cache_path.write_text(previous_content, "utf-8")

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
                    "version": PLUGIN_VERSION,
                    "installedAt": now,
                    "lastUpdated": now,
                }
            ]

        plugins_file.write_text(json.dumps(data, indent=2), encoding="utf-8")


class PluginWriter:
    """Writes a complete per-agent Claude Code plugin with topic-clustered skills.

    Install path: ~/.claude/plugins/cache/{APP_NAME}/{agent_id}/{version}/
    ├── .claude-plugin/plugin.json
    ├── skills/{cluster}/SKILL.md
    ├── hooks/hooks.json + inject-digest.js
    ├── .mcp.json
    └── references/digest.md

    Also writes a backward-compat primary skill to agent_dir/SKILL.md and records
    the plugin cache path in agent_dir/primary_skill_path.txt.
    """

    def __init__(self, agent_dir: pathlib.Path):
        self._agent_dir = agent_dir

    def write(self, plugin_output: "PluginOutput") -> bool:
        """Write full plugin structure. Returns True if primary skill changed.

        Source of truth: agent_dir/skills/{cluster}/SKILL.md
        Plugin cache:    ~/.claude/plugins/cache/omnis/{agent_id}/{version}/  (mirror only)
        """
        agent_id = plugin_output.agent_id

        # --- Increment per-agent plugin version ---
        version_file = self._agent_dir / "plugin_version.txt"
        prev = version_file.read_text("utf-8").strip() if version_file.exists() else "0"
        try:
            version = str(int(prev) + 1)
        except ValueError:
            version = "1"

        install_path = (
            pathlib.Path.home()
            / ".claude" / "plugins" / "cache"
            / APP_NAME / agent_id / version
        )

        # --- Cluster skills: write to agent_dir/skills/ first (source of truth) ---
        agent_skills_dir = self._agent_dir / "skills"
        if agent_skills_dir.exists():
            shutil.rmtree(agent_skills_dir)
        for spec in plugin_output.skills:
            cluster_dir = agent_skills_dir / spec.name
            cluster_dir.mkdir(parents=True, exist_ok=True)
            content = _sanitize_yaml_fence(spec.content)
            content = _sanitize_structure(content)
            (cluster_dir / "SKILL.md").write_text(content, encoding="utf-8")

        # --- Mirror skills to plugin cache ---
        plugin_skills_dir = install_path / "skills"
        if plugin_skills_dir.exists():
            shutil.rmtree(plugin_skills_dir)
        shutil.copytree(agent_skills_dir, plugin_skills_dir)

        # --- Plugin manifest ---
        manifest_dir = install_path / ".claude-plugin"
        manifest_dir.mkdir(parents=True, exist_ok=True)
        plugin_json = {
            "name": f"omnis-{agent_id}",
            "version": version,
            "description": f"Knowledge agent for {agent_id}",
            "author": "Omnis",
            "hooks": "./hooks/hooks.json",
            "mcp": "./.mcp.json",
        }
        (manifest_dir / "plugin.json").write_text(
            json.dumps(plugin_json, indent=2), encoding="utf-8"
        )

        # --- Hooks ---
        hooks_dir = install_path / "hooks"
        hooks_dir.mkdir(exist_ok=True)
        hooks_json = {
            "SessionStart": [{
                "matcher": "startup|resume",
                "hooks": [{
                    "type": "command",
                    "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/inject-digest.js\"",
                }],
            }]
        }
        (hooks_dir / "hooks.json").write_text(
            json.dumps(hooks_json, indent=2), encoding="utf-8"
        )
        inject_js = (
            "const fs = require('fs'), path = require('path');\n"
            "const f = path.join(process.env.CLAUDE_PLUGIN_ROOT, 'references', 'digest.md');\n"
            "if (fs.existsSync(f)) "
            "process.stdout.write(fs.readFileSync(f, 'utf8').split('\\n').slice(0, 80).join('\\n'));\n"
        )
        (hooks_dir / "inject-digest.js").write_text(inject_js, encoding="utf-8")

        # --- MCP config ---
        mcp_json = {
            "mcpServers": {
                f"omnis-{agent_id}": {"type": "sse", "url": "http://localhost:8420/mcp"},
            }
        }
        (install_path / ".mcp.json").write_text(
            json.dumps(mcp_json, indent=2), encoding="utf-8"
        )

        # --- References (digest bundle in plugin cache) ---
        refs_dir = install_path / "references"
        refs_dir.mkdir(exist_ok=True)
        digest_src = self._agent_dir / "digest.md"
        if digest_src.exists():
            shutil.copy2(digest_src, refs_dir / "digest.md")

        # --- primary_skill_path.txt → agent_dir/skills/{primary}/SKILL.md ---
        if plugin_output.skills:
            primary_agent_path = agent_skills_dir / plugin_output.skills[0].name / "SKILL.md"
            (self._agent_dir / "primary_skill_path.txt").write_text(
                str(primary_agent_path), encoding="utf-8"
            )

        # --- Agent definition ---
        self._write_agent_file(agent_id, install_path)

        # --- Backward compat: write agent_dir/SKILL.md (primary skill copy) ---
        changed = self._write_local_skill(plugin_output)

        # --- Track current version and install path ---
        version_file.write_text(version, encoding="utf-8")
        (self._agent_dir / "plugin_install_path.txt").write_text(
            str(install_path), encoding="utf-8"
        )

        # --- Register plugin ---
        plugin_key = f"{APP_NAME}@{agent_id}"
        self._register_plugin(install_path, plugin_key)

        return changed

    def _write_agent_file(self, agent_id: str, install_path: pathlib.Path) -> None:
        """Generate and write a plugin agent definition from the agent's SOUL.md.

        Source of truth: agent_dir/agents/{agent_id}.md
        Plugin cache:    install_path/agents/{agent_id}.md  (mirror)
        """
        soul_path = self._agent_dir / "SOUL.md"
        soul = soul_path.read_text(encoding="utf-8").strip() if soul_path.exists() else ""

        # Extract a one-line description from the first heading or first sentence
        description = f"Knowledge specialist for {agent_id}"
        for line in soul.splitlines():
            line = line.strip()
            if line.startswith("#"):
                description = line.lstrip("#").strip()
                break
            if line:
                description = line[:150]
                break

        content = (
            f"---\n"
            f"description: {description}\n"
            f"---\n\n"
            f"{soul}\n\n"
            f"## Knowledge Base\n"
            f"Read `references/digest.md` (relative to plugin root) for the full, "
            f"up-to-date knowledge digest. Use it when the user asks for specific details, "
            f"recent developments, or in-depth analysis on this domain.\n"
        )

        # Write to agent_dir/agents/ (source of truth)
        agents_dir = self._agent_dir / "agents"
        agents_dir.mkdir(exist_ok=True)
        (agents_dir / f"{agent_id}.md").write_text(content, encoding="utf-8")

        # Mirror to plugin cache
        plugin_agents_dir = install_path / "agents"
        plugin_agents_dir.mkdir(exist_ok=True)
        (plugin_agents_dir / f"{agent_id}.md").write_text(content, encoding="utf-8")

    def _write_local_skill(self, plugin_output: "PluginOutput") -> bool:
        """Write sanitized primary skill to agent_dir/SKILL.md. Returns True if changed."""
        if not plugin_output.skills:
            return False

        primary_content = plugin_output.skills[0].content
        primary_content = _sanitize_yaml_fence(primary_content)
        primary_content = _sanitize_structure(primary_content)

        knowledge_section = (
            "\n\n## Knowledge Base\n"
            "When detailed knowledge context is needed, read `references/digest.md` "
            "for the full knowledge digest."
        )
        primary_content = primary_content.rstrip() + knowledge_section

        local = self._agent_dir / "SKILL.md"
        previous_content = local.read_text("utf-8") if local.exists() else None
        local.write_text(primary_content, encoding="utf-8")

        if previous_content is None:
            return True
        if previous_content == primary_content:
            return False

        (self._agent_dir / "SKILL.previous.md").write_text(previous_content, "utf-8")
        diff = difflib.unified_diff(
            previous_content.splitlines(keepends=True),
            primary_content.splitlines(keepends=True),
            fromfile="SKILL.previous.md",
            tofile="SKILL.md",
        )
        (self._agent_dir / "SKILL.diff").write_text("".join(diff), "utf-8")
        return True

    def _register_plugin(self, install_path: pathlib.Path, plugin_key: str) -> None:
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

        if plugin_key in data["plugins"]:
            data["plugins"][plugin_key][0]["lastUpdated"] = now
        else:
            data["plugins"][plugin_key] = [{
                "scope": "user",
                "installPath": install_path_str,
                "version": PLUGIN_VERSION,
                "installedAt": now,
                "lastUpdated": now,
            }]

        plugins_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
