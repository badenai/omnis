import re

import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi

_CHANNEL_PATTERN = re.compile(
    r'youtube\.com/(@[\w.-]+|c/[\w.-]+|channel/UC[\w-]+|user/[\w.-]+)/?$'
)


def is_channel_url(url: str) -> bool:
    """Return True if url is a YouTube channel URL, False for video URLs."""
    return bool(_CHANNEL_PATTERN.search(url))


def get_channel_videos(url: str, limit: int | None = None) -> list[dict]:
    """Fetch video metadata from a channel URL.

    Returns a list of dicts with keys: id, title, description.
    Description is capped at 300 chars and defaults to empty string if missing.
    Entries without an id are skipped.
    """
    opts: dict = {
        "quiet": True,
        "extract_flat": True,
    }
    if limit is not None:
        opts["playlistend"] = limit

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    entries = info.get("entries", []) if info else []
    result = []
    for entry in entries:
        if not entry.get("id"):
            continue
        description = (entry.get("description") or "")[:300]
        result.append({
            "id": entry["id"],
            "title": entry.get("title", ""),
            "description": description,
        })
    return result


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
