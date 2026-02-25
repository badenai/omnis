import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi


# Compatibility shim: expose get_transcript as a classmethod so tests can patch
# core.collector.YouTubeTranscriptApi.get_transcript. The new youtube-transcript-api
# library uses YouTubeTranscriptApi().fetch() instead.
def _get_transcript_compat(video_id: str) -> list[dict]:
    api = YouTubeTranscriptApi()
    fetched = api.fetch(video_id)
    return [{"text": s.text, "start": s.start, "duration": s.duration} for s in fetched]


YouTubeTranscriptApi.get_transcript = staticmethod(_get_transcript_compat)


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


def fetch_transcript(video_id: str) -> str:
    """Download and join transcript segments into plain text."""
    segments = YouTubeTranscriptApi.get_transcript(video_id)
    return " ".join(s["text"] for s in segments)
