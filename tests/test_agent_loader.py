import pathlib
from core.agent_loader import load_agent


def test_load_agent_from_directory(tmp_path):
    agent_dir = tmp_path / "trading-price-action"
    agent_dir.mkdir()
    (agent_dir / "SOUL.md").write_text("# Soul\n## Mission\nTrade well.")
    config_yaml = """
agent_id: trading-price-action
model: gemini
analysis_mode: full_video
sources:
  youtube_channels:
    - handle: "@TestChan"
      check_schedule: "0 8 * * *"
consolidation_schedule: "0 3 * * 0"
decay:
  half_life_days: 365
"""
    (agent_dir / "config.yaml").write_text(config_yaml)

    agent = load_agent(agent_dir, gemini_api_key="fake-key")
    assert agent["config"].agent_id == "trading-price-action"
    assert "Trade well" in agent["soul"]
    assert "collection" in agent
    assert "consolidation" in agent
