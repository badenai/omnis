from core.models.types import (
    AnalysisResult, ConsolidationResult, AgentConfig,
    ResearchFinding, DiscoveredSource, ThesisValidationResult,
)

def test_analysis_result_fields():
    r = AnalysisResult(
        video_id="abc123",
        video_title="Test Video",
        insights=["insight 1"],
        relevance_score=0.85,
        suggested_action="update_concept",
        suggested_target="support-resistance",
        raw_summary="raw text",
    )
    assert r.relevance_score == 0.85
    assert r.video_id == "abc123"

def test_agent_config_defaults():
    cfg = AgentConfig(
        agent_id="test-agent",
        mode="accumulate",
        model="gemini",
        analysis_mode="full_video",
        sources={"youtube_channels": []},
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365},
    )
    assert cfg.mode == "accumulate"


def test_agent_config_has_research_field():
    config = AgentConfig(
        agent_id="test", mode="accumulate", model="gemini",
        analysis_mode="transcript_only",
        sources={}, consolidation_schedule="0 3 * * 0", decay={},
    )
    assert config.research == {}


def test_research_finding_dataclass():
    f = ResearchFinding(
        title="Test", insights=["a"], relevance_score=0.9,
        suggested_action="new_concept", suggested_target="test-topic",
        raw_summary="summary", sources_consulted=["https://example.com"]
    )
    assert f.relevance_score == 0.9


def test_discovered_source_dataclass():
    s = DiscoveredSource(
        url="https://youtube.com/@Test", source_type="youtube_channel",
        handle="@Test", rationale="highly relevant", discovered_at="2026-02-27T00:00:00Z"
    )
    assert s.source_type == "youtube_channel"


def test_thesis_validation_result_dataclass():
    r = ThesisValidationResult(
        flagged_files=[{"path": "concepts/foo.md", "concern": "outdated", "severity": "low"}],
        validation_summary="All good", searched_at="2026-02-27T00:00:00Z"
    )
    assert len(r.flagged_files) == 1
