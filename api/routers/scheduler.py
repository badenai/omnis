import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from core.scheduler_instance import get_scheduler
from core import job_status
from api.schemas import JobInfo

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])


@router.get("/jobs", response_model=list[JobInfo])
def list_jobs():
    scheduler = get_scheduler()
    jobs = []
    for job in scheduler.get_jobs():
        next_run = job.next_run_time.isoformat() if job.next_run_time else None
        jobs.append(JobInfo(id=job.id, name=job.name, next_run_time=next_run))
    return jobs


@router.post("/trigger/{agent_id}/collect/{handle}")
def trigger_collection(agent_id: str, handle: str, request: Request):
    agents = request.app.state.agents
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    pipeline = agent["collection"]
    scheduler = get_scheduler()

    scheduler.add_job(
        pipeline.run_collection,
        trigger="date",
        run_date=datetime.now(timezone.utc),
        args=[handle],
        id=f"{agent_id}_{handle}_manual_{datetime.now(timezone.utc).timestamp():.0f}",
        name=f"Manual collect {handle} for {agent_id}",
    )
    logger.info(f"Triggered collection: {agent_id} / {handle}")
    return {"status": "triggered", "agent_id": agent_id, "handle": handle}


@router.post("/trigger/{agent_id}/consolidate")
def trigger_consolidation(agent_id: str, request: Request):
    agents = request.app.state.agents
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    pipeline = agent["consolidation"]
    scheduler = get_scheduler()

    scheduler.add_job(
        pipeline.run,
        trigger="date",
        run_date=datetime.now(timezone.utc),
        id=f"{agent_id}_manual_consolidate_{datetime.now(timezone.utc).timestamp():.0f}",
        name=f"Manual consolidate {agent_id}",
    )
    logger.info(f"Triggered consolidation: {agent_id}")
    return {"status": "triggered", "agent_id": agent_id}


@router.post("/trigger/{agent_id}/reevaluate")
def trigger_reevaluation(agent_id: str, request: Request):
    agents = request.app.state.agents
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    pipeline = agent["consolidation"]
    scheduler = get_scheduler()

    scheduler.add_job(
        pipeline.run_reevaluation,
        trigger="date",
        run_date=datetime.now(timezone.utc),
        id=f"{agent_id}_manual_reevaluate_{datetime.now(timezone.utc).timestamp():.0f}",
        name=f"Manual reevaluate {agent_id}",
    )
    logger.info(f"Triggered reevaluation: {agent_id}")
    return {"status": "triggered", "agent_id": agent_id}


@router.get("/activity")
def get_activity():
    return {
        "active": job_status.get_active(),
        "history": job_status.get_history(),
    }
