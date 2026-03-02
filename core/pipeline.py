import pathlib
import logging
from core.collector import get_new_videos, fetch_transcript
from core.state import AgentState
from core.inbox import InboxWriter
from core.models.types import AgentConfig
from core.warnings import append_warnings
from core import job_status

logger = logging.getLogger(__name__)


class CollectionPipeline:
    def __init__(self, agent_dir: pathlib.Path, config: AgentConfig, provider, soul: str):
        self._dir = agent_dir
        self._config = config
        self._provider = provider
        self._soul = soul

    def run_collection(self, source_id: str) -> None:
        agent_id = self._config.agent_id
        task = f"collect/{source_id}"

        # Check source health before starting
        state = AgentState(self._dir)
        stats = state.get_source_stats(source_id)
        if stats.get("status") in ("paused", "flagged"):
            logger.info(f"Skipping {source_id} (status: {stats['status']})")
            return

        job_status.start(agent_id, task, f"Fetching new videos from {source_id}...")
        job_status.set_current(agent_id, task)

        try:
            new_videos = get_new_videos(source_id, state.processed_ids)
            if not new_videos:
                logger.info(f"No new videos from {source_id}")
                job_status.log(agent_id, task, f"No new videos from {source_id}")
                job_status.complete(agent_id, task)
                return

            inbox = InboxWriter(self._dir)
            total = len(new_videos)
            job_status.log(agent_id, task, f"Found {total} new video{'s' if total != 1 else ''} to analyze")
            for i, video in enumerate(new_videos, 1):
                vid_id = video["id"]
                vid_title = video.get("title", "")
                vid_url = video.get("webpage_url", f"https://www.youtube.com/watch?v={vid_id}")

                job_status.update_step(agent_id, task, f"Analyzing video {i}/{total}: {vid_title[:60]}...")
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

                    inbox.append(source_id, result)
                    state.mark_processed(vid_id)
                    state.record_source_score(source_id, result.relevance_score)
                    if result.credibility_signals:
                        state.record_source_credibility_flag(source_id, result.credibility_signals)
                    logger.info(f"Processed {vid_id} (relevance: {result.relevance_score})")

                    score = result.relevance_score
                    first_insight = result.insights[0][:80] if result.insights else result.raw_summary[:80]
                    threshold_note = "" if score >= 0.3 else " — below threshold"
                    job_status.log(
                        agent_id, task,
                        f'[{i}/{total}] "{vid_title[:50]}" — score {score:.2f}{threshold_note} — "{first_insight}"'
                    )
                except Exception as e:
                    logger.error(f"Failed to process {vid_id}: {e}")
                    job_status.log(agent_id, task, f"[{i}/{total}] Failed: {vid_title[:50]} — {e}")

            self._check_source_health(state)
            stats = state.get_source_stats(source_id)
            scores = stats.get("scores", [])
            avg = sum(scores[-10:]) / len(scores[-10:]) if scores else 0.0
            status = stats.get("status", "active")
            status_icon = "✓" if status == "active" else ("⏸" if status == "paused" else "⚠")
            job_status.log(
                agent_id, task,
                f"Source health: {source_id} avg {avg:.2f} — {status} {status_icon}"
            )

            from datetime import datetime, timezone
            state.update_last_checked(source_id, datetime.now(timezone.utc).isoformat())
            state.save()
            job_status.complete(agent_id, task)

        except Exception as e:
            logger.error(f"Collection failed for {source_id}: {e}")
            job_status.fail(agent_id, task, str(e))
            raise

    def _check_source_health(self, state: AgentState) -> None:
        state.recompute_agent_average()
        avg = state._data["agent_score_average"]
        warnings = []

        for source_id, stats in state._data["source_stats"].items():
            scores = stats.get("scores", [])
            if len(scores) < 5:
                continue
            source_avg = sum(scores) / len(scores)
            flags = stats.get("credibility_flags", {})

            if source_avg < avg * 0.6:
                state.set_source_status(source_id, "paused", "low_scores")
                warnings.append(
                    f"⏸ {source_id} paused: avg score {source_avg:.2f} vs agent avg {avg:.2f}"
                )
            elif flags.get("hype_pattern", 0) >= 3:
                state.set_source_status(source_id, "flagged", "hype_pattern")
                warnings.append(
                    f"⚠ {source_id} flagged: hype_pattern detected in ≥3 videos"
                )
            elif flags.get("unverified_claims", 0) >= 3:
                state.set_source_status(source_id, "flagged", "unverified_claims")
                warnings.append(
                    f"⚠ {source_id} flagged: unverified_claims in ≥3 videos"
                )

        if warnings:
            append_warnings(self._dir, warnings)
