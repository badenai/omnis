from unittest.mock import MagicMock, patch
from core.consolidation import ConsolidationPipeline
from core.models.types import AgentConfig, ConsolidationResult


def _make_config():
    return AgentConfig(
        agent_id="test-agent", model="gemini",
        analysis_mode="full_video",
        sources={"youtube_channels": []},
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365})


def test_consolidation_skips_when_inbox_empty(tmp_path):
    mock_provider = MagicMock()
    pipeline = ConsolidationPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
    pipeline.run()
    mock_provider.generate_digest.assert_not_called()


def test_consolidation_generates_digest_when_inbox_has_items(tmp_path, mocker):
    (tmp_path / "INBOX.md").write_text("## entry\ncontent here")
    (tmp_path / "knowledge").mkdir()
    (tmp_path / "knowledge" / "_index.md").write_text("# Index")

    mock_provider = MagicMock()
    mock_provider.consolidate.return_value = ConsolidationResult(
        updated_files=[], created_files=[]
    )
    mock_provider.generate_digest.return_value = "# Digest\nContent."
    mock_provider.generate_skill.return_value = "---\nname: test\n---\n# Skill"

    with patch("core.consolidation.SkillWriter") as MockSW, \
         patch("core.consolidation.Registry"):
        MockSW.return_value.write.return_value = tmp_path / "SKILL.md"
        pipeline = ConsolidationPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
        pipeline.run()

    assert (tmp_path / "digest.md").exists()
    assert "# Digest" in (tmp_path / "digest.md").read_text()
    mock_provider.generate_digest.assert_called_once()
    mock_provider.generate_skill.assert_called_once()


def test_consolidation_clears_inbox_after_run(tmp_path, mocker):
    (tmp_path / "INBOX.md").write_text("## entry\ncontent")
    (tmp_path / "knowledge").mkdir()

    mock_provider = MagicMock()
    mock_provider.consolidate.return_value = ConsolidationResult(updated_files=[], created_files=[])
    mock_provider.generate_digest.return_value = "# Digest"
    mock_provider.generate_skill.return_value = "# Skill"

    with patch("core.consolidation.SkillWriter"), \
         patch("core.consolidation.Registry"):
        pipeline = ConsolidationPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
        pipeline.run()

    assert not (tmp_path / "INBOX.md").exists()


def test_reevaluation_skips_when_no_knowledge_files(tmp_path):
    mock_provider = MagicMock()
    pipeline = ConsolidationPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
    pipeline.run_reevaluation()
    mock_provider.reevaluate_knowledge.assert_not_called()
    mock_provider.generate_digest.assert_not_called()


def test_reevaluation_scores_files_and_generates_outputs(tmp_path):
    import frontmatter as fm
    # Create a knowledge file
    concepts_dir = tmp_path / "knowledge" / "concepts"
    concepts_dir.mkdir(parents=True)
    post = fm.Post("Some content.", relevance_score=1.0, created="2026-01-01",
                   updated="2026-01-01", decay_half_life=365, sources=[], tags=[])
    (concepts_dir / "topic.md").write_text(fm.dumps(post), encoding="utf-8")

    mock_provider = MagicMock()
    mock_provider.reevaluate_knowledge.return_value = {"concepts/topic.md": 0.3}
    mock_provider.generate_digest.return_value = "# Digest\nContent."
    mock_provider.generate_skill.return_value = "---\nname: test\n---\n# Skill"

    with patch("core.consolidation.SkillWriter") as MockSW, \
         patch("core.consolidation.Registry"):
        MockSW.return_value.write.return_value = tmp_path / "SKILL.md"
        pipeline = ConsolidationPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
        pipeline.run_reevaluation()

    # Score was updated on disk
    reloaded = fm.load(str(concepts_dir / "topic.md"))
    assert reloaded["relevance_score"] == 0.3
    # Outputs were generated
    assert (tmp_path / "digest.md").exists()
    mock_provider.reevaluate_knowledge.assert_called_once()
    mock_provider.generate_digest.assert_called_once()
    mock_provider.generate_skill.assert_called_once()
