from unittest.mock import MagicMock
from core.collector import get_new_videos, fetch_transcript, is_channel_url, get_channel_videos


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
    mock_fetch = mocker.patch("core.collector._fetch_segments")
    mock_fetch.return_value = [
        {"text": "Hello world", "start": 0.0, "duration": 1.0},
        {"text": "Second sentence", "start": 1.0, "duration": 1.0},
    ]
    result = fetch_transcript("video-id")
    assert "Hello world" in result
    assert "Second sentence" in result


def test_is_channel_url_handle():
    assert is_channel_url("https://www.youtube.com/@mkbhd") is True

def test_is_channel_url_c():
    assert is_channel_url("https://www.youtube.com/c/LinusTechTips") is True

def test_is_channel_url_channel_id():
    assert is_channel_url("https://www.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw") is True

def test_is_channel_url_user():
    assert is_channel_url("https://www.youtube.com/user/pewdiepie") is True

def test_is_channel_url_rejects_video():
    assert is_channel_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ") is False

def test_is_channel_url_rejects_youtu_be():
    assert is_channel_url("https://youtu.be/dQw4w9WgXcQ") is False

def test_get_channel_videos_returns_id_title_description(mocker):
    fake_entries = [
        {"id": "abc123", "title": "Video One", "description": "A cool video"},
        {"id": "def456", "title": "Video Two", "description": ""},
    ]
    mock_ydl = mocker.MagicMock()
    mock_ydl.extract_info.return_value = {"entries": fake_entries}
    mocker.patch("yt_dlp.YoutubeDL", return_value=mocker.MagicMock(
        __enter__=mocker.MagicMock(return_value=mock_ydl),
        __exit__=mocker.MagicMock(return_value=False),
    ))
    result = get_channel_videos("https://www.youtube.com/@test")
    assert len(result) == 2
    assert result[0] == {"id": "abc123", "title": "Video One", "description": "A cool video"}
    assert result[1] == {"id": "def456", "title": "Video Two", "description": ""}

def test_get_channel_videos_respects_limit(mocker):
    mock_ydl = mocker.MagicMock()
    mock_ydl.extract_info.return_value = {"entries": []}
    captured_opts = {}
    def fake_ydl_init(opts):
        captured_opts.update(opts)
        ctx = mocker.MagicMock()
        ctx.__enter__ = mocker.MagicMock(return_value=mock_ydl)
        ctx.__exit__ = mocker.MagicMock(return_value=False)
        return ctx
    mocker.patch("yt_dlp.YoutubeDL", side_effect=fake_ydl_init)
    get_channel_videos("https://www.youtube.com/@test", limit=25)
    assert captured_opts.get("playlistend") == 25

def test_get_channel_videos_no_limit_no_playlistend(mocker):
    mock_ydl = mocker.MagicMock()
    mock_ydl.extract_info.return_value = {"entries": []}
    captured_opts = {}
    def fake_ydl_init(opts):
        captured_opts.update(opts)
        ctx = mocker.MagicMock()
        ctx.__enter__ = mocker.MagicMock(return_value=mock_ydl)
        ctx.__exit__ = mocker.MagicMock(return_value=False)
        return ctx
    mocker.patch("yt_dlp.YoutubeDL", side_effect=fake_ydl_init)
    get_channel_videos("https://www.youtube.com/@test")
    assert "playlistend" not in captured_opts
