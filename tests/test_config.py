import pathlib
from core.config import load_agent_config, load_soul

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


def test_load_agent_config():
    cfg = load_agent_config(FIXTURES / "trading-agent-config.yaml")
    assert cfg.agent_id == "trading-price-action"
    assert cfg.mode == "accumulate"
    assert cfg.model == "gemini"
    assert len(cfg.sources["youtube_channels"]) == 1


def test_load_soul(tmp_path):
    soul_file = tmp_path / "SOUL.md"
    soul_file.write_text("# Test Agent\n\n## Mission\nTest mission.")
    soul = load_soul(tmp_path)
    assert "Test mission" in soul


def test_load_soul_missing_returns_empty(tmp_path):
    soul = load_soul(tmp_path)
    assert soul == ""


def test_load_config_reads_research_block(tmp_path):
    yaml_content = """\
agent_id: test-agent
mode: accumulate
model: gemini
analysis_mode: transcript_only
sources: {}
consolidation_schedule: "0 3 * * 0"
decay:
  half_life_days: 365
research:
  enabled: true
  schedule: "0 10 * * *"
"""
    (tmp_path / "config.yaml").write_text(yaml_content)
    config = load_agent_config(tmp_path / "config.yaml")
    assert config.research == {"enabled": True, "schedule": "0 10 * * *"}


def test_load_config_defaults_research_to_empty(tmp_path):
    yaml_content = """\
agent_id: test-agent
mode: accumulate
model: gemini
analysis_mode: transcript_only
sources: {}
consolidation_schedule: "0 3 * * 0"
decay: {}
"""
    (tmp_path / "config.yaml").write_text(yaml_content)
    config = load_agent_config(tmp_path / "config.yaml")
    assert config.research == {}
