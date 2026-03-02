import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from starlette.responses import StreamingResponse

from core.scheduler_instance import get_scheduler
from core.scheduler import _run_daily
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


@router.post("/trigger/{agent_id}/run")
def trigger_run(agent_id: str, request: Request):
    agents = request.app.state.agents
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    scheduler = get_scheduler()

    scheduler.add_job(
        _run_daily,
        trigger="date",
        run_date=datetime.now(timezone.utc),
        args=[agent["collection"], agent["consolidation"], agent.get("self_improving")],
        id=f"{agent_id}_manual_run_{datetime.now(timezone.utc).timestamp():.0f}",
        name=f"Manual run {agent_id}",
    )
    logger.info(f"Triggered full daily run: {agent_id}")
    return {"status": "triggered", "agent_id": agent_id}


@router.post("/trigger/{agent_id}/collect/{handle}")
def trigger_collection(agent_id: str, handle: str, request: Request):
    agents = request.app.state.agents
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    collection_pipeline = agent["collection"]
    consolidation_pipeline = agent["consolidation"]
    scheduler = get_scheduler()

    def _collect_and_consolidate(handle: str):
        collection_pipeline.run_collection(handle)
        consolidation_pipeline.run()

    scheduler.add_job(
        _collect_and_consolidate,
        trigger="date",
        run_date=datetime.now(timezone.utc),
        args=[handle],
        id=f"{agent_id}_{handle}_manual_{datetime.now(timezone.utc).timestamp():.0f}",
        name=f"Manual collect {handle} for {agent_id}",
    )
    logger.info(f"Triggered collection + consolidation: {agent_id} / {handle}")
    return {"status": "triggered", "agent_id": agent_id, "handle": handle}


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


@router.post("/trigger/{agent_id}/fact-check/{source_id}")
def trigger_fact_check(agent_id: str, source_id: str, request: Request):
    agents = request.app.state.agents
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    fact_checker = agent.get("fact_checker")
    if not fact_checker:
        raise HTTPException(500, "Fact checker not available")

    scheduler = get_scheduler()
    scheduler.add_job(
        fact_checker.run,
        trigger="date",
        run_date=datetime.now(timezone.utc),
        args=[source_id],
        id=f"{agent_id}_factcheck_{source_id}_{datetime.now(timezone.utc).timestamp():.0f}",
        name=f"Fact-check {source_id} for {agent_id}",
    )
    logger.info(f"Triggered fact-check: {agent_id} / {source_id}")
    return {"status": "triggered", "agent_id": agent_id, "source_id": source_id}


@router.get("/activity")
def get_activity():
    return {
        "active": job_status.get_active(),
        "history": job_status.get_history(),
    }


@router.get("/activity/stream")
async def stream_activity():
    async def event_gen():
        while True:
            data = {"active": job_status.get_active(), "history": job_status.get_history()}
            yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(1.0)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
