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


def test_write_skill_copies_to_correct_claude_skills_path(tmp_path):
    """Skill must go in skills/{agent_id}/SKILL.md under the versioned plugin installPath."""
    agent_dir = tmp_path / "agents" / "trading"
    agent_dir.mkdir(parents=True)
    with patch("core.skill_writer.pathlib.Path.home", return_value=tmp_path):
        sw = SkillWriter(agent_dir)
        sw.write("# Skill Content", agent_id="trading")
    expected = (
        tmp_path / ".claude" / "plugins" / "cache"
        / "cloracle" / "cloracle" / PLUGIN_VERSION
        / "skills" / "trading" / "SKILL.md"
    )
    assert expected.exists(), f"Expected skill at {expected}"
    assert "Skill Content" in expected.read_text()


def test_write_skill_registers_plugin_in_installed_plugins(tmp_path):
    """First write must create the cloracle@cloracle entry in installed_plugins.json."""
    agent_dir = tmp_path / "agents" / "trading"
    agent_dir.mkdir(parents=True)
    plugins_file = tmp_path / ".claude" / "plugins" / "installed_plugins.json"
    plugins_file.parent.mkdir(parents=True, exist_ok=True)
    plugins_file.write_text(json.dumps({"version": 2, "plugins": {}}), encoding="utf-8")

    with patch("core.skill_writer.pathlib.Path.home", return_value=tmp_path):
        sw = SkillWriter(agent_dir)
        sw.write("# Content", agent_id="trading")

    data = json.loads(plugins_file.read_text(encoding="utf-8"))
    assert "cloracle@cloracle" in data["plugins"]
    entry = data["plugins"]["cloracle@cloracle"][0]
    assert entry["scope"] == "user"
    assert entry["version"] == PLUGIN_VERSION
    expected_install_path = str(
        tmp_path / ".claude" / "plugins" / "cache" / "cloracle" / "cloracle" / PLUGIN_VERSION
    )
    assert entry["installPath"] == expected_install_path


def test_write_skill_updates_last_updated_on_refresh(tmp_path):
    """Re-writing a skill must bump lastUpdated without duplicating the plugins entry."""
    agent_dir = tmp_path / "agents" / "trading"
    agent_dir.mkdir(parents=True)
    plugins_file = tmp_path / ".claude" / "plugins" / "installed_plugins.json"
    plugins_file.parent.mkdir(parents=True, exist_ok=True)
    plugins_file.write_text(json.dumps({"version": 2, "plugins": {}}), encoding="utf-8")

    with patch("core.skill_writer.pathlib.Path.home", return_value=tmp_path):
        sw = SkillWriter(agent_dir)
        sw.write("# v1", agent_id="trading")
        sw.write("# v2", agent_id="trading")

    data = json.loads(plugins_file.read_text(encoding="utf-8"))
    entries = data["plugins"]["cloracle@cloracle"]
    assert len(entries) == 1, "Should not create duplicate entries"


def test_write_skill_creates_installed_plugins_if_missing(tmp_path):
    """If installed_plugins.json doesn't exist yet, create it from scratch."""
    agent_dir = tmp_path / "agents" / "trading"
    agent_dir.mkdir(parents=True)

    with patch("core.skill_writer.pathlib.Path.home", return_value=tmp_path):
        sw = SkillWriter(agent_dir)
        sw.write("# Content", agent_id="trading")

    plugins_file = tmp_path / ".claude" / "plugins" / "installed_plugins.json"
    assert plugins_file.exists()
    data = json.loads(plugins_file.read_text(encoding="utf-8"))
    assert "cloracle@cloracle" in data["plugins"]


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
