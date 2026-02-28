import re
import pathlib
import logging
from urllib.request import urlopen, Request
from urllib.error import URLError
from html.parser import HTMLParser

from core.collector import fetch_transcript, get_channel_videos
from core.inbox import InboxWriter
from core.models.types import AgentConfig
from core.state import AgentState
from core import job_status

logger = logging.getLogger(__name__)

_YT_PATTERN = re.compile(
    r'(?:youtube\.com/watch\?.*v=|youtu\.be/)([A-Za-z0-9_-]{11})'
)


class _TextExtractor(HTMLParser):
    _SKIP_TAGS = {"script", "style", "nav", "footer", "head", "aside"}

    def __init__(self):
        super().__init__()
        self._texts: list[str] = []
        self._depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in self._SKIP_TAGS:
            self._depth += 1

    def handle_endtag(self, tag):
        if tag in self._SKIP_TAGS and self._depth:
            self._depth -= 1

    def handle_data(self, data):
        if not self._depth and data.strip():
            self._texts.append(data.strip())

    def get_text(self) -> str:
        return "\n".join(self._texts)


def _fetch_web_text(url: str) -> tuple[str, str]:
    """Return (title_hint, plain_text). Raises ValueError on failure."""
    try:
        req = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; cloracle/1.0)"})
        with urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        raise ValueError(f"Cannot fetch URL {url}: {e}") from e

    parser = _TextExtractor()
    parser.feed(html)
    text = parser.get_text()
    title_match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    title = title_match.group(1).strip() if title_match else url
    return title, text


class ManualIngestionPipeline:
    def __init__(self, agent_dir: pathlib.Path, config: AgentConfig, provider, soul: str):
        self._dir = agent_dir
        self._config = config
        self._provider = provider
        self._soul = soul

    def run_url(self, url: str, title: str | None = None) -> None:
        agent_id = self._config.agent_id
        task = "manual-ingest/url"
        job_status.start(agent_id, task, f"Ingesting URL: {url[:80]}")
        try:
            yt_match = _YT_PATTERN.search(url)
            if yt_match:
                video_id = yt_match.group(1)
                vid_title = title or url
                job_status.update_step(agent_id, task, "Analyzing YouTube video...")
                if self._config.analysis_mode == "full_video" and self._config.model == "gemini":
                    result = self._provider.analyze_video(
                        video_id, vid_title, url, self._soul,
                        "Extract key insights relevant to this agent's domain.",
                    )
                else:
                    transcript = fetch_transcript(video_id)
                    result = self._provider.analyze_transcript(
                        video_id, vid_title, transcript, self._soul,
                        "Extract key insights relevant to this agent's domain.",
                    )
            else:
                job_status.update_step(agent_id, task, "Fetching web page...")
                page_title, text = _fetch_web_text(url)
                resolved_title = title or page_title
                job_status.update_step(agent_id, task, f"Analyzing: {resolved_title[:60]}...")
                result = self._provider.analyze_web_content(url, text, resolved_title, self._soul)

            InboxWriter(self._dir).append("manual", result)
            logger.info(f"[{agent_id}] Ingested URL: {url} (relevance={result.relevance_score})")
            job_status.complete(agent_id, task)
        except Exception as e:
            logger.error(f"[{agent_id}] URL ingestion failed: {e}")
            job_status.fail(agent_id, task, str(e))
            raise

    def run_channel(self, url: str, limit: int | None = None) -> None:
        agent_id = self._config.agent_id
        task = "manual-ingest/channel"
        job_status.start(agent_id, task, f"Scanning channel: {url[:80]}")
        try:
            videos = get_channel_videos(url, limit)
            if not videos:
                job_status.complete(agent_id, task)
                return

            job_status.update_step(agent_id, task, f"Screening {len(videos)} videos against soul...")
            relevant_ids = set(self._provider.screen_videos(videos, self._soul))

            state = AgentState(self._dir)
            inbox = InboxWriter(self._dir)

            for vid in videos:
                vid_id = vid["id"]
                if vid_id not in relevant_ids:
                    continue
                job_status.update_step(agent_id, task, f"Analyzing video {vid_id}...")
                try:
                    if self._config.analysis_mode == "full_video" and self._config.model == "gemini":
                        vid_url = f"https://www.youtube.com/watch?v={vid_id}"
                        result = self._provider.analyze_video(
                            vid_id, vid["title"], vid_url, self._soul,
                            "Extract key insights relevant to this agent's domain.",
                        )
                    else:
                        transcript = fetch_transcript(vid_id)
                        result = self._provider.analyze_transcript(
                            vid_id, vid["title"], transcript, self._soul,
                            "Extract key insights relevant to this agent's domain.",
                        )
                    inbox.append("manual", result)
                    logger.info(
                        f"[{agent_id}] Channel scan: processed {vid_id} (relevance={result.relevance_score})"
                    )
                except Exception as e:
                    logger.error(f"[{agent_id}] Channel scan: error processing {vid_id}: {e}")

            for v in videos:
                state.mark_processed(v["id"])
            state.save()

            job_status.complete(agent_id, task)
        except Exception as e:
            logger.error(f"[{agent_id}] Channel scan failed: {e}")
            job_status.fail(agent_id, task, str(e))
            raise

    def run_file(self, file_bytes: bytes, mime_type: str, filename: str, title: str | None = None) -> None:
        agent_id = self._config.agent_id
        task = "manual-ingest/file"
        display = title or filename
        job_status.start(agent_id, task, f"Ingesting file: {display}")
        try:
            job_status.update_step(agent_id, task, "Uploading to Gemini for analysis...")
            result = self._provider.analyze_uploaded_file(file_bytes, mime_type, display, self._soul)
            InboxWriter(self._dir).append("manual", result)
            logger.info(f"[{agent_id}] Ingested file: {filename} (relevance={result.relevance_score})")
            job_status.complete(agent_id, task)
        except Exception as e:
            logger.error(f"[{agent_id}] File ingestion failed: {e}")
            job_status.fail(agent_id, task, str(e))
            raise
