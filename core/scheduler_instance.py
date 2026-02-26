from apscheduler.schedulers.background import BackgroundScheduler

_scheduler: BackgroundScheduler | None = None


def get_scheduler() -> BackgroundScheduler:
    if _scheduler is None:
        raise RuntimeError("Scheduler not initialized")
    return _scheduler


def set_scheduler(scheduler: BackgroundScheduler) -> None:
    global _scheduler
    _scheduler = scheduler
