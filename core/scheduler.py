import pathlib
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


def build_scheduler(agents: list[dict], scheduler: BackgroundScheduler | None = None) -> BackgroundScheduler:
    if scheduler is None:
        scheduler = BackgroundScheduler()

    for agent in agents:
        config = agent["config"]
        collection_pipeline = agent["collection"]
        consolidation_pipeline = agent["consolidation"]

        for channel in config.sources.get("youtube_channels", []):
            handle = channel["handle"]
            cron = channel.get("check_schedule", "0 8 * * *")
            parts = cron.split()
            trigger = CronTrigger(
                minute=parts[0], hour=parts[1],
                day=parts[2], month=parts[3], day_of_week=parts[4],
            )
            scheduler.add_job(
                collection_pipeline.run_collection,
                trigger=trigger,
                args=[handle],
                id=f"{config.agent_id}_{handle}_collect",
                name=f"Collect {handle} for {config.agent_id}",
            )
            logger.info(f"Scheduled collection: {config.agent_id} / {handle} @ {cron}")

        cron = config.consolidation_schedule
        parts = cron.split()
        scheduler.add_job(
            consolidation_pipeline.run,
            trigger=CronTrigger(
                minute=parts[0], hour=parts[1],
                day=parts[2], month=parts[3], day_of_week=parts[4],
            ),
            id=f"{config.agent_id}_consolidate",
            name=f"Consolidate {config.agent_id}",
        )
        logger.info(f"Scheduled consolidation: {config.agent_id} @ {cron}")

    return scheduler
