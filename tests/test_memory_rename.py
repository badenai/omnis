import pathlib
import pytest


def test_consolidation_writes_memory_md(tmp_path, mocker):
    """Consolidation must write memory.md, not briefing.md."""
    from core.consolidation import ConsolidationPipeline
    from core.models.types import AgentConfig

    config = AgentConfig(
        agent_id="test", model="gemini",
        analysis_mode="transcript_only", sources={},
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365})
    provider = mocker.MagicMock()
    provider.consolidate.return_value = mocker.MagicMock(decisions=[])
    provider.generate_briefing.return_value = "# Memory\nTest content."
    provider.generate_skill.return_value = "# Skill"
    provider.validate_thesis.side_effect = Exception("skip")

    inbox_path = tmp_path / "INBOX.md"
    inbox_path.write_text("---\n## Item 1\ncontent\n", encoding="utf-8")
    (tmp_path / "knowledge").mkdir()

    pipeline = ConsolidationPipeline(tmp_path, config, provider, soul="Be an expert.")
    mocker.patch("core.consolidation.Registry")
    mocker.patch("core.consolidation.AgentState")
    pipeline.run()

    assert (tmp_path / "memory.md").exists(), "memory.md must be written"
    assert not (tmp_path / "briefing.md").exists(), "briefing.md must not be written"
