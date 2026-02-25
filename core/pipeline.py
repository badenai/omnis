import pathlib
import logging
from core.collector import get_new_videos, fetch_transcript
from core.state import AgentState
from core.inbox import InboxWriter
from core.models.types import AgentConfig

logger = logging.getLogger(__name__)


class CollectionPipeline:
    def __init__(self, agent_dir: pathlib.Path, config: AgentConfig, provider, soul: str):
        self._dir = agent_dir
        self._config = config
        self._provider = provider
        self._soul = soul

    def run_collection(self, channel_handle: str) -> None:
        state = AgentState(self._dir)
        new_videos = get_new_videos(channel_handle, state.processed_ids)
        if not new_videos:
            logger.info(f"No new videos from {channel_handle}")
            return

        inbox = InboxWriter(self._dir)
        for video in new_videos:
            vid_id = video["id"]
            vid_title = video.get("title", "")
            vid_url = video.get("webpage_url", f"https://www.youtube.com/watch?v={vid_id}")

            try:
                if self._config.analysis_mode == "full_video" and self._config.model == "gemini":
                    result = self._provider.analyze_video(
                        vid_id, vid_title, vid_url, self._soul,
                        "Extract key insights relevant to this agent's domain.",
                    )
                else:
                    transcript = fetch_transcript(vid_id)
                    result = self._provider.analyze_transcript(
                        vid_id, vid_title, transcript, self._soul,
                        "Extract key insights relevant to this agent's domain.",
                    )

                inbox.append(channel_handle, result)
                state.mark_processed(vid_id)
                logger.info(f"Processed {vid_id} (relevance: {result.relevance_score})")
            except Exception as e:
                logger.error(f"Failed to process {vid_id}: {e}")

        state.save()
