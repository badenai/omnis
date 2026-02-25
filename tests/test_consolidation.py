from unittest.mock import MagicMock, patch
from core.consolidation import ConsolidationPipeline
from core.models.types import AgentConfig, ConsolidationResult


def _make_config():
    return AgentConfig(
        agent_id="test-agent", mode="accumulate", model="gemini",
        analysis_mode="full_video",
        sources={"youtube_channels": []},
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365},
    )


def test_consolidation_skips_when_inbox_empty(tmp_path):
    mock_provider = MagicMock()
    pipeline = ConsolidationPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
    pipeline.run()
    mock_provider.generate_briefing.assert_not_called()


def test_consolidation_generates_briefing_when_inbox_has_items(tmp_path, mocker):
    (tmp_path / "INBOX.md").write_text("## entry\ncontent here")
    (tmp_path / "knowledge").mkdir()
    (tmp_path / "knowledge" / "_index.md").write_text("# Index")

    mock_provider = MagicMock()
    mock_provider.consolidate.return_value = ConsolidationResult(
        updated_files=[], created_files=[]
    )
    mock_provider.generate_briefing.return_value = "# Briefing\nContent."
    mock_provider.generate_skill.return_value = "---\nname: test\n---\n# Skill"

    # Patch SkillWriter to avoid touching the real ~/.claude dir
    with patch("core.consolidation.SkillWriter") as MockSW:
        MockSW.return_value.write.return_value = tmp_path / "SKILL.md"
        pipeline = ConsolidationPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
        pipeline.run()

    assert (tmp_path / "briefing.md").exists()
    assert "# Briefing" in (tmp_path / "briefing.md").read_text()
    mock_provider.generate_briefing.assert_called_once()
    mock_provider.generate_skill.assert_called_once()


def test_consolidation_clears_inbox_after_run(tmp_path, mocker):
    (tmp_path / "INBOX.md").write_text("## entry\ncontent")
    (tmp_path / "knowledge").mkdir()

    mock_provider = MagicMock()
    mock_provider.consolidate.return_value = ConsolidationResult(updated_files=[], created_files=[])
    mock_provider.generate_briefing.return_value = "# Briefing"
    mock_provider.generate_skill.return_value = "# Skill"

    with patch("core.consolidation.SkillWriter"):
        pipeline = ConsolidationPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
        pipeline.run()

    assert not (tmp_path / "INBOX.md").exists()
