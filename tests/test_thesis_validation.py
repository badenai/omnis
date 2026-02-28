import pytest
from unittest.mock import MagicMock, patch
from core.consolidation import ConsolidationPipeline
from core.models.types import AgentConfig, ThesisValidationResult


def make_config(mode="accumulate"):
    return AgentConfig(
        agent_id="test", mode=mode, model="gemini",
        analysis_mode="transcript_only",
        sources={}, consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365},
    )


def make_validation_result(flagged=True):
    flags = [{"path": "concepts/foo.md", "concern": "outdated", "severity": "high"}] if flagged else []
    return ThesisValidationResult(
        flagged_files=flags, validation_summary="One issue found.",
        searched_at="2026-02-27T00:00:00Z"
    )


def test_validation_appends_to_briefing(tmp_path):
    config = make_config()
    provider = MagicMock()
    provider.validate_thesis.return_value = make_validation_result()
    memory = tmp_path / "memory.md"
    memory.write_text("# Original Briefing\n", encoding="utf-8")

    pipeline = ConsolidationPipeline(tmp_path, config, provider, "soul")
    with patch("core.consolidation.KnowledgeWriter") as MockKW:
        MockKW.return_value.load_all_weighted.return_value = [
            {"path": "concepts/foo.md", "content": "some content"}
        ]
        pipeline.run_thesis_validation()

    content = memory.read_text(encoding="utf-8")
    assert "Thesis Validation" in content
    assert "One issue found." in content
    assert "[HIGH]" in content


def test_validation_failure_does_not_crash_consolidation_run(tmp_path):
    config = make_config()
    provider = MagicMock()
    provider.validate_thesis.side_effect = RuntimeError("search failed")

    pipeline = ConsolidationPipeline(tmp_path, config, provider, "soul")
    with patch.object(pipeline, "run_thesis_validation", side_effect=RuntimeError("search failed")):
        try:
            pipeline._call_thesis_validation_safely()
        except Exception:
            pytest.fail("Should not propagate exception")


def test_validation_skipped_for_watch_mode(tmp_path):
    config = make_config(mode="watch")
    provider = MagicMock()
    pipeline = ConsolidationPipeline(tmp_path, config, provider, "soul")
    pipeline._call_thesis_validation_safely()
    provider.validate_thesis.assert_not_called()
