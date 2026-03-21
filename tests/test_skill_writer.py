import pathlib
import json
from unittest.mock import patch
from core.skill_writer import SkillWriter
from core.registry import Registry

PLUGIN_VERSION = "1.0.0"


def test_write_skill_creates_file_in_agent_dir(tmp_path):
    agent_dir = tmp_path / "agents" / "trading"
    agent_dir.mkdir(parents=True)
    with patch("core.skill_writer.pathlib.Path.home", return_value=tmp_path):
        sw = SkillWriter(agent_dir)
        sw.write("# Trading Knowledge\n\nContent here.", agent_id="trading")
    skill_file = agent_dir / "SKILL.md"
    assert skill_file.exists()
    assert "Trading Knowledge" in skill_file.read_text()


def test_registry_register_and_save(tmp_path):
    reg = Registry(tmp_path / "registry.json")
    reg.register("trading", tmp_path / "agents" / "trading" / "SKILL.md")
    reg.save()

    reg2 = Registry(tmp_path / "registry.json")
    assert "trading" in reg2.agents


def test_registry_load_missing_returns_empty(tmp_path):
    reg = Registry(tmp_path / "registry.json")
    assert reg.agents == {}


def test_plugin_writer_returns_tuple_with_version(tmp_path):
    """write() must return (skill_changed: bool, version: str)."""
    from core.skill_writer import PluginWriter
    from core.models.types import PluginOutput, SkillSpec
    agent_dir = tmp_path / "my-agent"
    agent_dir.mkdir()
    (agent_dir / "SOUL.md").write_text("# Agent\nFocus.")
    output = PluginOutput(agent_id="my-agent", skills=[
        SkillSpec(name="main", description="Main skill", file_pattern=None, bash_pattern=None, content="# Skill content")
    ], session_hook_digest="")
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
        SkillSpec(name="main", description="Main skill", file_pattern=None, bash_pattern=None, content="# Skill content")
    ], session_hook_digest="")
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
        SkillSpec(name="main", description="Main skill", file_pattern=None, bash_pattern=None, content="# Skill content")
    ], session_hook_digest="")
    with patch("core.skill_writer.pathlib.Path.home", return_value=tmp_path):
        pw = PluginWriter(agent_dir)
        pw.write(output)
    installed = tmp_path / ".claude" / "plugins" / "installed_plugins.json"
    assert not installed.exists()
