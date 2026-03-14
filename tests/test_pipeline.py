from unittest.mock import MagicMock, patch
from core.pipeline import CollectionPipeline
from core.models.types import AgentConfig, AnalysisResult
from core.sources.base import SourceItem


def _make_config(analysis_mode="full_video"):
    return AgentConfig(
        agent_id="test-agent",
        model="gemini",
        analysis_mode=analysis_mode,
        sources=[{"type": "youtube", "handle": "@TestChan", "analysis_mode": analysis_mode}],
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365})


def _make_result():
    return AnalysisResult(
        video_id="vid-new",
        video_title="New Video",
        insights=["insight"],
        relevance_score=0.9,
        suggested_action="new_concept",
        suggested_target="new-concept",
        raw_summary="summary")


_SOURCE_CONFIG = {"type": "youtube", "handle": "@TestChan", "analysis_mode": "full_video"}
_TRANSCRIPT_SOURCE_CONFIG = {"type": "youtube", "handle": "@TestChan"}


def test_run_collection_processes_new_videos(tmp_path, mocker):
    items = [SourceItem(source_id="vid-new", title="New Video", content="",
                        source_url="https://yt.com/watch?v=vid-new", analysis_mode="full_video")]
    mocker.patch("core.sources.youtube.YouTubePlugin.fetch", return_value=items)

    mock_provider = MagicMock()
    mock_provider.analyze_video.return_value = _make_result()

    pipeline = CollectionPipeline(tmp_path, _make_config(), mock_provider, soul="soul text")
    pipeline.run_collection(_SOURCE_CONFIG)

    inbox = (tmp_path / "INBOX.md").read_text()
    assert "vid-new" in inbox
    mock_provider.analyze_video.assert_called_once()


def test_run_collection_skips_when_no_new_videos(tmp_path, mocker):
    mocker.patch("core.sources.youtube.YouTubePlugin.fetch", return_value=[])
    mock_provider = MagicMock()

    pipeline = CollectionPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
    pipeline.run_collection(_SOURCE_CONFIG)

    assert not (tmp_path / "INBOX.md").exists()
    mock_provider.analyze_video.assert_not_called()


def test_run_collection_uses_web_content_when_not_full_video(tmp_path, mocker):
    items = [SourceItem(source_id="vid-t", title="T Video", content="transcript text",
                        source_url="https://yt.com/watch?v=vid-t")]
    mocker.patch("core.sources.youtube.YouTubePlugin.fetch", return_value=items)

    mock_provider = MagicMock()
    mock_provider.analyze_web_content.return_value = AnalysisResult(
        video_id="vid-t", video_title="T Video", insights=[],
        relevance_score=0.5, suggested_action="new_recent",
        suggested_target="recent", raw_summary="")

    config = AgentConfig(
        agent_id="test", model="gemini",
        analysis_mode="transcript_only",
        sources=[{"type": "youtube", "handle": "@TestChan"}],
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365})
    pipeline = CollectionPipeline(tmp_path, config, mock_provider, soul="soul")
    pipeline.run_collection(_TRANSCRIPT_SOURCE_CONFIG)

    mock_provider.analyze_web_content.assert_called_once()
    mock_provider.analyze_video.assert_not_called()


def test_run_collection_marks_video_processed(tmp_path, mocker):
    items = [SourceItem(source_id="vid-new", title="V", content="",
                        source_url="https://yt.com/watch?v=vid-new", analysis_mode="full_video")]
    mocker.patch("core.sources.youtube.YouTubePlugin.fetch", return_value=items)

    mock_provider = MagicMock()
    mock_provider.analyze_video.return_value = _make_result()

    pipeline = CollectionPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
    pipeline.run_collection(_SOURCE_CONFIG)

    from core.state import AgentState
    state = AgentState(tmp_path)
    assert "vid-new" in state.processed_ids
