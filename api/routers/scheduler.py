import asyncio
import json
import logging
import pathlib
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from starlette.responses import StreamingResponse

from core.scheduler_instance import get_scheduler
from core.scheduler import _run_daily
from core import job_status
from core.constants import APP_NAME
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
def trigger_collection(agent_id: str, handle: str, request: Request, consolidate: bool = Query(True)):
    agents = request.app.state.agents
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    collection_pipeline = agent["collection"]
    consolidation_pipeline = agent["consolidation"]
    scheduler = get_scheduler()

    def _collect_and_consolidate(handle: str):
        collection_pipeline.run_collection(handle)
        if consolidate:
            consolidation_pipeline.run()

    scheduler.add_job(
        _collect_and_consolidate,
        trigger="date",
        run_date=datetime.now(timezone.utc),
        args=[handle],
        id=f"{agent_id}_{handle}_manual_{datetime.now(timezone.utc).timestamp():.0f}",
        name=f"Manual collect {handle} for {agent_id}",
    )
    logger.info(f"Triggered collection (consolidate={consolidate}): {agent_id} / {handle}")
    return {"status": "triggered", "agent_id": agent_id, "handle": handle}


@router.post("/trigger/{agent_id}/scan/{handle}")
def trigger_scan(agent_id: str, handle: str, request: Request, limit: int | None = Query(None)):
    agents = request.app.state.agents
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    ingestion_pipeline = agent.get("ingestion")
    if not ingestion_pipeline:
        raise HTTPException(500, "Ingestion pipeline not available")

    scheduler = get_scheduler()
    url = f"https://www.youtube.com/{handle}"
    _limit = limit  # capture for closure

    def _do_scan():
        ingestion_pipeline.run_channel(url, _limit, False)

    scheduler.add_job(
        _do_scan,
        trigger="date",
        run_date=datetime.now(timezone.utc),
        id=f"{agent_id}_{handle}_scan_{datetime.now(timezone.utc).timestamp():.0f}",
        name=f"Scan history {handle} for {agent_id}",
    )
    logger.info(f"Triggered channel scan: {agent_id} / {handle} (limit={limit})")
    return {"status": "triggered", "agent_id": agent_id, "handle": handle}


@router.post("/trigger/{agent_id}/consolidate")
def trigger_consolidation(agent_id: str, request: Request):
    agents = request.app.state.agents
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    scheduler = get_scheduler()

    scheduler.add_job(
        agent["consolidation"].run,
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


_SKILL_PLUGIN_VERSION = "1.0.0"


@router.post("/trigger/{agent_id}/audit-skill")
def trigger_audit_skill(agent_id: str, request: Request):
    """Combined audit: structure check + trigger description optimization."""
    agents = request.app.state.agents
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    agent_dir: pathlib.Path = agent["dir"]
    soul: str = agent["soul"]
    provider = agent["provider"]

    skill_dir = (
        pathlib.Path.home()
        / ".claude" / "plugins" / "cache"
        / APP_NAME / APP_NAME / _SKILL_PLUGIN_VERSION
        / "skills" / agent_id
    )
    if not skill_dir.exists():
        raise HTTPException(
            400,
            f"Skill directory not found at {skill_dir} — run consolidation first to generate SKILL.md.",
        )

    from core.description_optimizer import run_structure_audit, apply_structure_fixes, run_description_optimization

    scheduler = get_scheduler()

    def _run():
        task = "audit-skill"
        job_status.start(agent_id, task, "Starting skill audit…")
        job_status.set_current(agent_id, task)
        try:
            # Phase 1: structure audit
            job_status.update_step(agent_id, task, "Phase 1/3 — checking structure…")
            result = run_structure_audit(
                agent_dir=agent_dir,
                agent_id=agent_id,
                skill_dir=skill_dir,
                provider=provider,
                job_log_fn=job_status.log,
            )
            if result:
                issues = result.get("issues", [])
                job_status.log(agent_id, task, f"Structure score: {result['overall_score']}/100")
                for iss in issues:
                    label = "✕" if iss["severity"] == "error" else "⚠"
                    job_status.log(agent_id, task, f"  {label} {iss['criterion']}: {iss['issue']}")
                    job_status.log(agent_id, task, f"    → {iss['suggestion']}")

            # Phase 2: auto-fix structural issues
            if result and result.get("issues"):
                job_status.update_step(agent_id, task, "Phase 2/3 — applying fixes…")
                apply_structure_fixes(
                    agent_dir=agent_dir,
                    agent_id=agent_id,
                    skill_dir=skill_dir,
                    provider=provider,
                    job_log_fn=job_status.log,
                )
            else:
                job_status.log(agent_id, task, "No structural issues — skipping rewrite")

            # Phase 3: trigger optimization
            job_status.update_step(agent_id, task, "Phase 3/3 — optimizing trigger…")
            best = run_description_optimization(
                agent_dir=agent_dir,
                agent_id=agent_id,
                skill_dir=skill_dir,
                soul=soul,
                provider=provider,
                job_log_fn=job_status.log,
            )
            if best:
                job_status.update_step(agent_id, task, f"Done — trigger: {best[:60]}…")
                job_status.complete(agent_id, task)
            else:
                job_status.fail(agent_id, task, "Trigger optimization failed — check SKILL.md frontmatter")
        except Exception as e:
            logger.error(f"Skill audit error: {e}")
            job_status.fail(agent_id, task, str(e))

    scheduler.add_job(
        _run,
        trigger="date",
        run_date=datetime.now(timezone.utc),
        id=f"{agent_id}_audit_skill_{datetime.now(timezone.utc).timestamp():.0f}",
        name=f"Audit skill {agent_id}",
    )
    logger.info(f"Triggered skill audit: {agent_id}")
    return {"status": "triggered", "agent_id": agent_id}


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
