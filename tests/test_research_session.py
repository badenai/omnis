import pathlib
import pytest
from unittest.mock import MagicMock
from core.research_session import ResearchSession
from core.models.types import AgentConfig, ResearchFinding, DiscoveredSource
from datetime import datetime, timezone


def make_config(agent_id="test-agent"):
    return AgentConfig(
        agent_id=agent_id, mode="accumulate", model="gemini",
        analysis_mode="transcript_only",
        sources={"youtube_channels": [{"handle": "@Existing"}]},
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365},
        research={"enabled": True, "schedule": "0 10 * * *"},
    )


def make_finding(title="Test Finding"):
    return ResearchFinding(
        title=title, insights=["insight 1", "insight 2"],
        relevance_score=0.85, suggested_action="new_concept",
        suggested_target="test-finding", raw_summary="A test summary.",
        sources_consulted=["https://example.com"],
    )


def make_source():
    return DiscoveredSource(
        url="https://youtube.com/@NewChannel", source_type="youtube_channel",
        handle="@NewChannel", rationale="Great content",
        discovered_at=datetime.now(timezone.utc).isoformat(),
    )


def test_research_session_writes_finding_to_inbox(tmp_path):
    config = make_config()
    provider = MagicMock()
    provider.research_domain.return_value = ([make_finding()], [])

    session = ResearchSession(tmp_path, config, provider, "soul text")
    session.run()

    inbox = tmp_path / "INBOX.md"
    assert inbox.exists()
    content = inbox.read_text(encoding="utf-8")
    assert "Test Finding" in content


def test_research_session_logs_discovered_sources(tmp_path):
    config = make_config()
    provider = MagicMock()
    provider.research_domain.return_value = ([make_finding()], [make_source()])

    session = ResearchSession(tmp_path, config, provider, "soul text")
    session.run()

    discovered = tmp_path / "discovered_sources.md"
    assert discovered.exists()
    assert "@NewChannel" in discovered.read_text(encoding="utf-8")


def test_research_session_no_findings_does_not_create_inbox(tmp_path):
    config = make_config()
    provider = MagicMock()
    provider.research_domain.return_value = ([], [])

    session = ResearchSession(tmp_path, config, provider, "soul text")
    session.run()

    assert not (tmp_path / "INBOX.md").exists()


def test_research_session_provider_failure_propagates(tmp_path):
    config = make_config()
    provider = MagicMock()
    provider.research_domain.side_effect = RuntimeError("API failure")

    session = ResearchSession(tmp_path, config, provider, "soul text")
    with pytest.raises(RuntimeError, match="API failure"):
        session.run()
