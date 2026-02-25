from core.models.types import AnalysisResult, ConsolidationResult, AgentConfig

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
