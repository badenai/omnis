import pathlib
import pytest
from unittest.mock import MagicMock
from core.self_improving import SelfImprovingSession
from core.models.types import AgentConfig, ResearchFinding, DiscoveredSource
from datetime import datetime, timezone


def make_config(agent_id="test-agent"):
    return AgentConfig(
        agent_id=agent_id, model="gemini",
        analysis_mode="transcript_only",
        sources=[{"type": "youtube", "handle": "@Existing"}],
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365},
        self_improving=True)


def make_finding(title="Test Finding"):
    return ResearchFinding(
        title=title, insights=["insight 1", "insight 2"],
        relevance_score=0.85, suggested_action="new_concept",
        suggested_target="test-finding", raw_summary="A test summary.",
        sources_consulted=["https://example.com"])


def make_source(handle="@NewChannel"):
    return DiscoveredSource(
        url=f"https://youtube.com/{handle}", source_type="youtube_channel",
        handle=handle, rationale="Great content",
        discovered_at=datetime.now(timezone.utc).isoformat(),
        is_recurring=True)


def test_self_improving_writes_finding_to_inbox(tmp_path):
    config = make_config()
    provider = MagicMock()
    provider.research_domain.return_value = ([make_finding()], [])

    session = SelfImprovingSession(tmp_path, config, provider, "soul text")
    session.run()

    inbox = tmp_path / "INBOX.md"
    assert inbox.exists()
    content = inbox.read_text(encoding="utf-8")
    assert "Test Finding" in content


def test_self_improving_logs_discovered_sources(tmp_path):
    import yaml
    config_path = tmp_path / "config.yaml"
    config_data = {
        "agent_id": "test-agent", "model": "gemini",
        "analysis_mode": "transcript_only",
        "sources": [{"type": "youtube", "handle": "@Existing"}],
        "consolidation_schedule": "0 3 * * 0",
        "decay": {"half_life_days": 365}, "self_improving": True,
    }
    config_path.write_text(yaml.dump(config_data), encoding="utf-8")

    config = make_config()
    provider = MagicMock()
    provider.research_domain.return_value = ([make_finding()], [make_source()])

    session = SelfImprovingSession(tmp_path, config, provider, "soul text")
    session.run()

    discovered = tmp_path / "discovered_sources.md"
    assert discovered.exists()
    assert "@NewChannel" in discovered.read_text(encoding="utf-8")


def test_self_improving_no_findings_does_not_create_inbox(tmp_path):
    config = make_config()
    provider = MagicMock()
    provider.research_domain.return_value = ([], [])

    session = SelfImprovingSession(tmp_path, config, provider, "soul text")
    session.run()

    assert not (tmp_path / "INBOX.md").exists()


def test_self_improving_sources_processed_even_with_no_findings(tmp_path):
    import yaml
    config_path = tmp_path / "config.yaml"
    config_data = {
        "agent_id": "test-agent", "model": "gemini",
        "analysis_mode": "transcript_only",
        "sources": [{"type": "youtube", "handle": "@Existing"}],
        "consolidation_schedule": "0 3 * * 0",
        "decay": {"half_life_days": 365}, "self_improving": True,
    }
    config_path.write_text(yaml.dump(config_data), encoding="utf-8")

    config = make_config()
    provider = MagicMock()
    provider.research_domain.return_value = ([], [make_source("@NewChannel")])

    session = SelfImprovingSession(tmp_path, config, provider, "soul text")
    session.run()

    raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    handles = [s["handle"] for s in raw["sources"] if s.get("type") == "youtube"]
    assert "@NewChannel" in handles
    assert not (tmp_path / "INBOX.md").exists()


def test_auto_add_sources_normalizes_handle_without_at(tmp_path):
    import yaml
    config_path = tmp_path / "config.yaml"
    config_data = {
        "agent_id": "test-agent", "model": "gemini",
        "analysis_mode": "transcript_only",
        "sources": [],
        "consolidation_schedule": "0 3 * * 0",
        "decay": {"half_life_days": 365}, "self_improving": True,
    }
    config_path.write_text(yaml.dump(config_data), encoding="utf-8")

    config = make_config()
    config.sources = []
    bare_source = DiscoveredSource(
        url="https://youtube.com/SomeChannel", source_type="youtube_channel",
        handle="SomeChannel", rationale="Good channel",
        discovered_at="2026-01-01T00:00:00+00:00", is_recurring=True)
    provider = MagicMock()
    provider.research_domain.return_value = ([make_finding()], [bare_source])

    session = SelfImprovingSession(tmp_path, config, provider, "soul text")
    session.run()

    raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    handles = [s["handle"] for s in raw["sources"] if s.get("type") == "youtube"]
    assert "@SomeChannel" in handles


def test_self_improving_provider_failure_propagates(tmp_path):
    config = make_config()
    provider = MagicMock()
    provider.research_domain.side_effect = RuntimeError("API failure")

    session = SelfImprovingSession(tmp_path, config, provider, "soul text")
    with pytest.raises(RuntimeError, match="API failure"):
        session.run()


def test_auto_add_sources_writes_new_channel_to_config(tmp_path):
    import yaml
    config_path = tmp_path / "config.yaml"
    config_data = {
        "agent_id": "test-agent",
        "model": "gemini",
        "analysis_mode": "transcript_only",
        "sources": [{"type": "youtube", "handle": "@Existing"}],
        "consolidation_schedule": "0 3 * * 0",
        "decay": {"half_life_days": 365},
        "self_improving": True,
    }
    config_path.write_text(yaml.dump(config_data), encoding="utf-8")

    config = make_config()
    provider = MagicMock()
    provider.research_domain.return_value = ([make_finding()], [make_source("@NewChannel")])

    session = SelfImprovingSession(tmp_path, config, provider, "soul text")
    session.run()

    raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    handles = [s["handle"] for s in raw["sources"] if s.get("type") == "youtube"]
    assert "@NewChannel" in handles
    assert "@Existing" in handles


def test_auto_add_sources_skips_existing_channel(tmp_path):
    import yaml
    config_path = tmp_path / "config.yaml"
    config_data = {
        "agent_id": "test-agent",
        "model": "gemini",
        "analysis_mode": "transcript_only",
        "sources": [{"type": "youtube", "handle": "@Existing"}],
        "consolidation_schedule": "0 3 * * 0",
        "decay": {"half_life_days": 365},
        "self_improving": True,
    }
    config_path.write_text(yaml.dump(config_data), encoding="utf-8")

    config = make_config()
    provider = MagicMock()
    provider.research_domain.return_value = ([make_finding()], [make_source("@Existing")])

    session = SelfImprovingSession(tmp_path, config, provider, "soul text")
    session.run()

    raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    handles = [s["handle"] for s in raw["sources"] if s.get("type") == "youtube"]
    assert handles.count("@Existing") == 1


def test_auto_add_sources_adds_blog_as_web_page(tmp_path):
    import yaml
    config_path = tmp_path / "config.yaml"
    config_data = {
        "agent_id": "test-agent", "model": "gemini",
        "analysis_mode": "transcript_only",
        "sources": [],
        "consolidation_schedule": "0 3 * * 0",
        "decay": {"half_life_days": 365}, "self_improving": True,
    }
    config_path.write_text(yaml.dump(config_data), encoding="utf-8")

    config = make_config()
    config.sources = []
    blog_source = DiscoveredSource(
        url="https://example.com/blog", source_type="blog",
        handle=None, rationale="Good blog",
        discovered_at=datetime.now(timezone.utc).isoformat(), is_recurring=True)
    provider = MagicMock()
    provider.research_domain.return_value = ([make_finding()], [blog_source])

    session = SelfImprovingSession(tmp_path, config, provider, "soul text")
    session.run()

    raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    # Blog source should be added as web_page
    types = [s["type"] for s in raw["sources"]]
    assert "web_page" in types
    # No YouTube entries added
    youtube_entries = [s for s in raw["sources"] if s.get("type") == "youtube"]
    assert youtube_entries == []
