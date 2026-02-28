import pytest
from unittest.mock import MagicMock, patch
from core.manual_ingestion import ManualIngestionPipeline
from core.models.types import AgentConfig, AnalysisResult


def make_config():
    return AgentConfig(
        agent_id="test", model="gemini",
        analysis_mode="transcript_only",
        sources={}, consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365})


def make_result(title="Test"):
    return AnalysisResult(
        video_id="x", video_title=title, insights=["i"],
        relevance_score=0.8, suggested_action="new_concept",
        suggested_target="test", raw_summary="summary")


def test_ingest_youtube_url_full_video(tmp_path):
    from dataclasses import replace
    config = make_config()
    config = AgentConfig(**{**config.__dict__, "analysis_mode": "full_video"})
    provider = MagicMock()
    provider.analyze_video.return_value = make_result("YT Video")
    ManualIngestionPipeline(tmp_path, config, provider, "soul").run_url(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    )
    provider.analyze_video.assert_called_once()
    assert (tmp_path / "INBOX.md").exists()


def test_ingest_youtube_url_transcript_mode(tmp_path):
    config = make_config()
    provider = MagicMock()
    provider.analyze_transcript.return_value = make_result("YT Transcript")
    with patch("core.manual_ingestion.fetch_transcript", return_value="transcript text"):
        ManualIngestionPipeline(tmp_path, config, provider, "soul").run_url(
            "https://youtu.be/dQw4w9WgXcQ"
        )
    provider.analyze_transcript.assert_called_once()
    assert (tmp_path / "INBOX.md").exists()


def test_ingest_web_url(tmp_path):
    config = make_config()
    provider = MagicMock()
    provider.analyze_web_content.return_value = make_result("Web Page")
    with patch("core.manual_ingestion._fetch_web_text", return_value=("Web Page", "page text")):
        ManualIngestionPipeline(tmp_path, config, provider, "soul").run_url(
            "https://example.com/article"
        )
    provider.analyze_web_content.assert_called_once()
    assert (tmp_path / "INBOX.md").exists()


def test_ingest_file(tmp_path):
    config = make_config()
    provider = MagicMock()
    provider.analyze_uploaded_file.return_value = make_result("My PDF")
    ManualIngestionPipeline(tmp_path, config, provider, "soul").run_file(
        b"%PDF content", "application/pdf", "document.pdf"
    )
    provider.analyze_uploaded_file.assert_called_once()
    assert (tmp_path / "INBOX.md").exists()


def test_ingest_web_url_fetch_failure_raises(tmp_path):
    config = make_config()
    provider = MagicMock()
    with patch("core.manual_ingestion._fetch_web_text", side_effect=ValueError("Cannot fetch")):
        with pytest.raises(Exception):
            ManualIngestionPipeline(tmp_path, config, provider, "soul").run_url(
                "https://unreachable.example.com"
            )


import pathlib
from core.models.types import AnalysisResult


def _make_result(video_id="v1"):
    return AnalysisResult(
        video_id=video_id, video_title="T", insights=[], relevance_score=0.9,
        suggested_action="new_concept", suggested_target="test", raw_summary="s")


def _make_pipeline(tmp_path, analysis_mode="transcript_only"):
    config = MagicMock()
    config.agent_id = "test-agent"
    config.analysis_mode = analysis_mode
    config.model = "gemini"
    provider = MagicMock()
    return ManualIngestionPipeline(tmp_path, config, provider, soul="AI research"), provider


def test_run_channel_analyzes_only_matching_videos(tmp_path):
    pipeline, provider = _make_pipeline(tmp_path)
    videos = [
        {"id": "match1", "title": "Relevant", "description": ""},
        {"id": "skip1", "title": "Unrelated", "description": ""},
    ]
    provider.screen_videos.return_value = ["match1"]
    provider.analyze_transcript.return_value = _make_result("match1")
    with patch("core.manual_ingestion.get_channel_videos", return_value=videos), \
         patch("core.manual_ingestion.fetch_transcript", return_value="transcript"):
        pipeline.run_channel("https://youtube.com/@test")
    provider.analyze_transcript.assert_called_once()
    assert provider.analyze_transcript.call_args[0][0] == "match1"
    provider.analyze_video.assert_not_called()


def test_run_channel_marks_all_videos_processed(tmp_path):
    pipeline, provider = _make_pipeline(tmp_path)
    videos = [
        {"id": "match1", "title": "Relevant", "description": ""},
        {"id": "skip1", "title": "Unrelated", "description": ""},
    ]
    provider.screen_videos.return_value = ["match1"]
    provider.analyze_transcript.return_value = _make_result("match1")
    with patch("core.manual_ingestion.get_channel_videos", return_value=videos), \
         patch("core.manual_ingestion.fetch_transcript", return_value="transcript"):
        pipeline.run_channel("https://youtube.com/@test")
    from core.state import AgentState
    state = AgentState(tmp_path)
    assert "match1" in state.processed_ids
    assert "skip1" in state.processed_ids


def test_run_channel_respects_limit(tmp_path):
    pipeline, provider = _make_pipeline(tmp_path)
    provider.screen_videos.return_value = []
    with patch("core.manual_ingestion.get_channel_videos", return_value=[]) as mock_fetch:
        pipeline.run_channel("https://youtube.com/@test", limit=25)
    mock_fetch.assert_called_once_with("https://youtube.com/@test", 25)


def test_run_channel_empty_channel_completes(tmp_path):
    pipeline, provider = _make_pipeline(tmp_path)
    with patch("core.manual_ingestion.get_channel_videos", return_value=[]):
        pipeline.run_channel("https://youtube.com/@test")
    provider.screen_videos.assert_not_called()


def test_run_channel_uses_full_video_mode(tmp_path):
    pipeline, provider = _make_pipeline(tmp_path, analysis_mode="full_video")
    videos = [{"id": "v1", "title": "T", "description": ""}]
    provider.screen_videos.return_value = ["v1"]
    provider.analyze_video.return_value = _make_result("v1")
    with patch("core.manual_ingestion.get_channel_videos", return_value=videos):
        pipeline.run_channel("https://youtube.com/@test")
    provider.analyze_video.assert_called_once()
    call_args = provider.analyze_video.call_args[0]
    assert call_args[2] == "https://www.youtube.com/watch?v=v1"
    provider.analyze_transcript.assert_not_called()


def test_run_channel_continues_after_per_video_error(tmp_path):
    pipeline, provider = _make_pipeline(tmp_path)
    videos = [
        {"id": "fail1", "title": "Will Fail", "description": ""},
        {"id": "ok1", "title": "Will Succeed", "description": ""},
    ]
    provider.screen_videos.return_value = ["fail1", "ok1"]
    provider.analyze_transcript.side_effect = [Exception("network error"), _make_result("ok1")]
    with patch("core.manual_ingestion.get_channel_videos", return_value=videos), \
         patch("core.manual_ingestion.fetch_transcript", return_value="transcript"):
        pipeline.run_channel("https://youtube.com/@test")
    assert provider.analyze_transcript.call_count == 2
    from core.state import AgentState
    state = AgentState(tmp_path)
    assert "fail1" in state.processed_ids
    assert "ok1" in state.processed_ids
