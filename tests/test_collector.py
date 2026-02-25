from unittest.mock import MagicMock
from core.collector import get_new_videos, fetch_transcript


def test_get_new_videos_filters_processed(mocker):
    mock_ydl = MagicMock()
    mock_ydl.__enter__ = lambda s: s
    mock_ydl.__exit__ = MagicMock(return_value=False)
    mock_ydl.extract_info.return_value = {
        "entries": [
            {"id": "new-video", "title": "New Video", "webpage_url": "https://yt.com/watch?v=new-video"},
            {"id": "old-video", "title": "Old Video", "webpage_url": "https://yt.com/watch?v=old-video"},
        ]
    }
    mocker.patch("core.collector.yt_dlp.YoutubeDL", return_value=mock_ydl)

    already_processed = {"old-video"}
    results = get_new_videos("@TestChannel", already_processed)

    assert len(results) == 1
    assert results[0]["id"] == "new-video"


def test_fetch_transcript_returns_text(mocker):
    mock_transcript = mocker.patch("core.collector.YouTubeTranscriptApi.get_transcript")
    mock_transcript.return_value = [
        {"text": "Hello world"},
        {"text": "Second sentence"},
    ]
    result = fetch_transcript("video-id")
    assert "Hello world" in result
    assert "Second sentence" in result
