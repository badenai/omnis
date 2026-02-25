import pathlib


class SkillWriter:
    def __init__(self, agent_dir: pathlib.Path):
        self._agent_dir = agent_dir

    def write(self, skill_content: str, agent_id: str) -> pathlib.Path:
        dest = self._agent_dir / "SKILL.md"
        dest.write_text(skill_content, encoding="utf-8")

        claude_skills = (
            pathlib.Path.home()
            / ".claude"
            / "plugins"
            / "cache"
            / "cloracle"
            / agent_id
        )
        claude_skills.mkdir(parents=True, exist_ok=True)
        (claude_skills / "SKILL.md").write_text(skill_content, encoding="utf-8")

        return dest
