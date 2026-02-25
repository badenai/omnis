from unittest.mock import MagicMock
from core.pipeline import CollectionPipeline
from core.models.types import AgentConfig, AnalysisResult


def _make_config():
    return AgentConfig(
        agent_id="test-agent",
        mode="accumulate",
        model="gemini",
        analysis_mode="full_video",
        sources={"youtube_channels": [{"handle": "@TestChan", "check_schedule": "0 8 * * *"}]},
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365},
    )


def _make_result():
    return AnalysisResult(
        video_id="vid-new",
        video_title="New Video",
        insights=["insight"],
        relevance_score=0.9,
        suggested_action="new_concept",
        suggested_target="new-concept",
        raw_summary="summary",
    )


def test_run_collection_processes_new_videos(tmp_path, mocker):
    mocker.patch("core.pipeline.get_new_videos", return_value=[
        {"id": "vid-new", "title": "New Video", "webpage_url": "https://yt.com/watch?v=vid-new"}
    ])
    mock_provider = MagicMock()
    mock_provider.analyze_video.return_value = _make_result()

    pipeline = CollectionPipeline(tmp_path, _make_config(), mock_provider, soul="soul text")
    pipeline.run_collection("@TestChan")

    inbox = (tmp_path / "INBOX.md").read_text()
    assert "vid-new" in inbox
    mock_provider.analyze_video.assert_called_once()


def test_run_collection_skips_when_no_new_videos(tmp_path, mocker):
    mocker.patch("core.pipeline.get_new_videos", return_value=[])
    mock_provider = MagicMock()

    pipeline = CollectionPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
    pipeline.run_collection("@TestChan")

    assert not (tmp_path / "INBOX.md").exists()
    mock_provider.analyze_video.assert_not_called()


def test_run_collection_uses_transcript_when_not_full_video(tmp_path, mocker):
    mocker.patch("core.pipeline.get_new_videos", return_value=[
        {"id": "vid-t", "title": "T Video", "webpage_url": "https://yt.com/watch?v=vid-t"}
    ])
    mocker.patch("core.pipeline.fetch_transcript", return_value="transcript text")
    mock_provider = MagicMock()
    mock_provider.analyze_transcript.return_value = AnalysisResult(
        video_id="vid-t", video_title="T Video", insights=[],
        relevance_score=0.5, suggested_action="new_recent",
        suggested_target="recent", raw_summary="",
    )

    config = AgentConfig(
        agent_id="test", mode="accumulate", model="gemini",
        analysis_mode="transcript_only",
        sources={"youtube_channels": []},
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365},
    )
    pipeline = CollectionPipeline(tmp_path, config, mock_provider, soul="soul")
    pipeline.run_collection("@TestChan")

    mock_provider.analyze_transcript.assert_called_once()
    mock_provider.analyze_video.assert_not_called()


def test_run_collection_marks_video_processed(tmp_path, mocker):
    mocker.patch("core.pipeline.get_new_videos", return_value=[
        {"id": "vid-new", "title": "V", "webpage_url": "https://yt.com/watch?v=vid-new"}
    ])
    mock_provider = MagicMock()
    mock_provider.analyze_video.return_value = _make_result()

    pipeline = CollectionPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
    pipeline.run_collection("@TestChan")

    from core.state import AgentState
    state = AgentState(tmp_path)
    assert "vid-new" in state.processed_ids
