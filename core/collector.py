import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi


def get_new_videos(channel_handle: str, processed_ids: set[str]) -> list[dict]:
    """Fetch recent videos from a YouTube channel, excluding already-processed IDs."""
    url = f"https://www.youtube.com/{channel_handle}/videos"
    opts = {
        "quiet": True,
        "extract_flat": True,
        "playlistend": 10,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    entries = info.get("entries", []) if info else []
    return [e for e in entries if e.get("id") not in processed_ids]


def _fetch_segments(video_id: str) -> list[dict]:
    fetched = YouTubeTranscriptApi().fetch(video_id)
    return [{"text": s.text, "start": s.start, "duration": s.duration} for s in fetched]


def fetch_transcript(video_id: str) -> str:
    """Download and join transcript segments into plain text."""
    segments = _fetch_segments(video_id)
    return " ".join(s["text"] for s in segments)
