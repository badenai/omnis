import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


def _run_daily(collection_pipeline, consolidation_pipeline, self_improving_session):
    for source_config in collection_pipeline._config.sources:
        try:
            collection_pipeline.run_collection(source_config)
        except Exception as e:
            logger.warning(f"Collection failed for {source_config}, skipping: {e}")
    consolidation_pipeline.run()
    if self_improving_session and collection_pipeline._config.self_improving:
        self_improving_session.run()


def build_scheduler(agents: list[dict], scheduler: BackgroundScheduler | None = None) -> BackgroundScheduler:
    if scheduler is None:
        scheduler = BackgroundScheduler()

    for agent in agents:
        config = agent["config"]
        if config.paused:
            logger.info(f"Skipping scheduler for paused agent: {config.agent_id}")
            continue
        collection_pipeline = agent["collection"]
        consolidation_pipeline = agent["consolidation"]
        self_improving_session = agent.get("self_improving")

        cron = config.consolidation_schedule
        parts = cron.split()
        trigger = CronTrigger(
            minute=parts[0], hour=parts[1],
            day=parts[2], month=parts[3], day_of_week=parts[4],
        )
        scheduler.add_job(
            _run_daily,
            trigger=trigger,
            args=[collection_pipeline, consolidation_pipeline, self_improving_session],
            id=f"{config.agent_id}_daily",
            name=f"Daily run {config.agent_id}",
        )
        logger.info(f"Scheduled daily run: {config.agent_id} @ {cron}")

    return scheduler
