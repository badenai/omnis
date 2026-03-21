import difflib
import pathlib
import re
import shutil
from typing import TYPE_CHECKING


if TYPE_CHECKING:
    from core.models.types import PluginOutput


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
        then restores SKILL.previous.md as the active skill in the agent directory.

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

        # Mirror to agent_dir/skills/{primary}.
        skills_dir = self._agent_dir / "skills"
        cluster_dirs = sorted(d for d in skills_dir.iterdir() if d.is_dir()) if skills_dir.exists() else []
        if cluster_dirs:
            primary_agent_path = cluster_dirs[0] / "SKILL.md"
            primary_agent_path.parent.mkdir(parents=True, exist_ok=True)
            primary_agent_path.write_text(previous_content, "utf-8")

        return True


class PluginWriter:
    """Writes per-agent plugin files to the agent directory (source of truth only).

    agent_dir/
    ├── skills/{cluster}/SKILL.md   — topic-clustered skills
    ├── agents/{agent_id}.md        — agent definition from SOUL.md
    ├── SKILL.md                    — backward-compat primary skill copy
    └── plugin_version.txt          — auto-incremented version counter

    No writes to ~/.claude/plugins/cache/ — GitHub publishing handles distribution.
    """

    def __init__(self, agent_dir: pathlib.Path, version_override: str | None = None):
        self._agent_dir = agent_dir
        self._version_override = version_override

    def write(self, plugin_output: "PluginOutput") -> tuple[bool, str]:
        """Write full plugin structure. Returns (skill_changed, version).

        Source of truth: agent_dir/skills/{cluster}/SKILL.md
        """
        agent_id = plugin_output.agent_id

        # --- Resolve plugin version (config pin or auto-increment) ---
        version_file = self._agent_dir / "plugin_version.txt"
        if self._version_override is not None:
            version = str(self._version_override)
        else:
            prev = version_file.read_text("utf-8").strip() if version_file.exists() else "0"
            try:
                version = str(int(prev) + 1)
            except ValueError:
                version = "1"

        # --- Cluster skills: write to agent_dir/skills/ (source of truth) ---
        agent_skills_dir = self._agent_dir / "skills"
        if agent_skills_dir.exists():
            shutil.rmtree(agent_skills_dir)
        for spec in plugin_output.skills:
            cluster_dir = agent_skills_dir / spec.name
            cluster_dir.mkdir(parents=True, exist_ok=True)
            content = _sanitize_yaml_fence(spec.content)
            content = _sanitize_structure(content)
            (cluster_dir / "SKILL.md").write_text(content, encoding="utf-8")

        # --- Agent definition ---
        self._write_agent_file(agent_id)

        # --- Backward compat: write agent_dir/SKILL.md (primary skill copy) ---
        changed = self._write_local_skill(plugin_output)

        # --- Track current version ---
        version_file.write_text(version, encoding="utf-8")

        return changed, version

    def _write_agent_file(self, agent_id: str) -> None:
        """Generate and write a plugin agent definition from the agent's SOUL.md.

        Source of truth: agent_dir/agents/{agent_id}.md
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

