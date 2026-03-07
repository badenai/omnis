import json
import os
import re
import urllib.request

import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi

_CHANNEL_PATTERN = re.compile(
    r'youtube\.com/(@[\w.-]+|c/[\w.-]+|channel/UC[\w-]+|user/[\w.-]+)/?$'
)


def is_channel_url(url: str) -> bool:
    """Return True if url points to a YouTube channel (not a video)."""
    return bool(_CHANNEL_PATTERN.search(url.split("?")[0]))


def _videos_url(url: str) -> str:
    """Normalise a channel URL to point at the /videos tab.

    Passing a bare channel URL (e.g. youtube.com/c/Foo or youtube.com/@Foo)
    to yt_dlp returns the channel *tabs* as top-level entries rather than the
    actual videos.  Appending /videos forces yt_dlp to fetch only the video
    uploads playlist.
    """
    clean = url.rstrip("/").split("?")[0]
    if not clean.endswith("/videos"):
        clean += "/videos"
    return clean


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
        info = ydl.extract_info(_videos_url(url), download=False)

    entries = info.get("entries") or [] if info else []
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


def _api_kwargs() -> dict:
    """Build YouTubeTranscriptApi keyword args from environment."""
    kwargs: dict = {}
    cookies_file = os.environ.get("YOUTUBE_COOKIES_FILE")
    if cookies_file:
        kwargs["cookies"] = cookies_file
    proxies: dict = {}
    if os.environ.get("HTTPS_PROXY"):
        proxies["https"] = os.environ["HTTPS_PROXY"]
    if os.environ.get("HTTP_PROXY"):
        proxies["http"] = os.environ["HTTP_PROXY"]
    if proxies:
        kwargs["proxies"] = proxies
    return kwargs


def _fetch_segments(video_id: str) -> list[dict]:
    fetched = YouTubeTranscriptApi(**_api_kwargs()).fetch(video_id)
    return [{"text": s.text, "start": s.start, "duration": s.duration} for s in fetched]


def _fetch_segments_via_ytdlp(video_id: str) -> list[dict]:
    """Fallback transcript fetch using yt-dlp caption URLs (avoids timedtext endpoint)."""
    opts: dict = {
        "quiet": True,
        "skip_download": True,
        "subtitleslangs": ["en", "en-US", "en-GB"],
        "writesubtitles": True,
        "writeautomaticsub": True,
    }
    cookies_file = os.environ.get("YOUTUBE_COOKIES_FILE")
    if cookies_file:
        opts["cookiefile"] = cookies_file
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
    if proxy:
        opts["proxy"] = proxy

    url = f"https://www.youtube.com/watch?v={video_id}"
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    captions = (info or {}).get("subtitles") or {}
    auto = (info or {}).get("automatic_captions") or {}

    caption_data = None
    for lang in ("en", "en-US", "en-GB"):
        if lang in captions:
            caption_data = captions[lang]
            break
        if lang in auto:
            caption_data = auto[lang]
            break
    if caption_data is None:
        caption_data = next(iter(captions.values()), None) or next(iter(auto.values()), None)
    if not caption_data:
        raise ValueError(f"No captions available for video {video_id}")

    fmt = next((f for f in caption_data if f.get("ext") in ("vtt", "json3")), caption_data[0])
    with urllib.request.urlopen(fmt["url"]) as resp:
        content = resp.read().decode("utf-8")

    if fmt.get("ext") == "json3":
        return _parse_json3_captions(content)
    return _parse_vtt_captions(content)


def _parse_vtt_captions(vtt: str) -> list[dict]:
    segments = []
    for block in re.split(r'\n\n+', vtt):
        lines = [ln.strip() for ln in block.strip().splitlines()]
        text_lines = [
            ln for ln in lines
            if ln and '-->' not in ln and not ln.startswith(('WEBVTT', 'NOTE', 'STYLE', 'REGION'))
        ]
        if text_lines:
            text = re.sub(r'<[^>]+>', '', ' '.join(text_lines)).strip()
            if text:
                segments.append({"text": text, "start": 0.0, "duration": 0.0})
    return segments


def _parse_json3_captions(json_str: str) -> list[dict]:
    data = json.loads(json_str)
    segments = []
    for event in data.get("events", []):
        if "segs" not in event:
            continue
        text = "".join(s.get("utf8", "") for s in event["segs"]).strip()
        if text and text != "\n":
            segments.append({
                "text": text,
                "start": event.get("tStartMs", 0) / 1000,
                "duration": event.get("dDurationMs", 0) / 1000,
            })
    return segments


def fetch_transcript(video_id: str) -> str:
    """Download and join transcript segments into plain text.

    Tries YouTubeTranscriptApi first; falls back to yt-dlp caption extraction
    if the server IP is blocked by YouTube's timedtext endpoint.
    """
    try:
        segments = _fetch_segments(video_id)
    except Exception:
        segments = _fetch_segments_via_ytdlp(video_id)
    return " ".join(s["text"] for s in segments)
