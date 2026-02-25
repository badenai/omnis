import pathlib
import json
from unittest.mock import patch
from core.skill_writer import SkillWriter
from core.registry import Registry


def test_write_skill_creates_file_in_agent_dir(tmp_path):
    agent_dir = tmp_path / "agents" / "trading"
    agent_dir.mkdir(parents=True)
    # Patch the Claude skills copy so we don't touch the real ~/.claude dir
    with patch("core.skill_writer.pathlib.Path.home", return_value=tmp_path):
        sw = SkillWriter(agent_dir)
        sw.write("# Trading Knowledge\n\nContent here.", agent_id="trading")
    skill_file = agent_dir / "SKILL.md"
    assert skill_file.exists()
    assert "Trading Knowledge" in skill_file.read_text()


def test_write_skill_copies_to_claude_dir(tmp_path):
    agent_dir = tmp_path / "agents" / "trading"
    agent_dir.mkdir(parents=True)
    with patch("core.skill_writer.pathlib.Path.home", return_value=tmp_path):
        sw = SkillWriter(agent_dir)
        sw.write("# Skill Content", agent_id="trading")
    claude_skill = tmp_path / ".claude" / "plugins" / "cache" / "cloracle" / "trading" / "SKILL.md"
    assert claude_skill.exists()


def test_registry_register_and_save(tmp_path):
    reg = Registry(tmp_path / "registry.json")
    reg.register("trading", tmp_path / "agents" / "trading" / "SKILL.md", "accumulate")
    reg.save()

    reg2 = Registry(tmp_path / "registry.json")
    assert "trading" in reg2.agents
    assert reg2.agents["trading"]["mode"] == "accumulate"


def test_registry_load_missing_returns_empty(tmp_path):
    reg = Registry(tmp_path / "registry.json")
    assert reg.agents == {}
