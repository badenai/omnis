import os
import shutil
import pathlib
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, UploadFile, File, Form

from core.config import load_agent_config, load_soul, save_agent_config, save_soul, save_soul_backup, restore_soul_backup
from core.agent_loader import load_agent
from core.scheduler import build_scheduler
from core.scheduler_instance import get_scheduler
from core.state import AgentState
from core.inbox import InboxWriter
from core.knowledge import KnowledgeWriter
from api.schemas import (
    AgentConfigCreate,
    AgentConfigUpdate,
    AgentDetail,
    AgentSummary,
    IngestChannelExecuteRequest,
    IngestUrlRequest,
    SoulIntegrateRequest,
    SoulPreviewEvalRequest,
    SoulUpdate,
    SourceStats,
)

from core.collector import get_channel_videos
from yt_dlp.utils import DownloadError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agents", tags=["agents"])

from core.constants import DATA_DIR
AGENTS_DIR = DATA_DIR / "agents"


def _get_agents(request: Request) -> dict:
    return request.app.state.agents


def _agent_summary(agent: dict) -> AgentSummary:
    config = agent["config"]
    agent_dir = agent["dir"]
    state = AgentState(agent_dir)
    inbox = InboxWriter(agent_dir)
    kw = KnowledgeWriter(agent_dir, config.decay.get("half_life_days", 365))
    knowledge_files = kw.load_all_weighted()

    from core.skill_quality import SkillQualityStore
    store = SkillQualityStore(agent_dir)
    latest_score = store.latest_score()
    quality_alert = store.is_alert(config.skill_eval.min_quality_threshold)

    return AgentSummary(
        agent_id=config.agent_id,
        model=config.model,
        analysis_mode=config.analysis_mode,
        consolidation_schedule=config.consolidation_schedule,
        source_count=len(config.sources),
        last_consolidation=state._data.get("last_consolidation"),
        inbox_count=len(inbox.read_items()),
        knowledge_count=len(knowledge_files),
        self_improving=config.self_improving,
        latest_quality_score=latest_score,
        quality_alert=quality_alert,
        paused=config.paused,
    )


def _agent_detail(agent: dict) -> AgentDetail:
    config = agent["config"]
    agent_dir = agent["dir"]
    state = AgentState(agent_dir)
    inbox = InboxWriter(agent_dir)
    kw = KnowledgeWriter(agent_dir, config.decay.get("half_life_days", 365))
    knowledge_files = kw.load_all_weighted()

    raw_source_stats = state._data.get("source_stats", {})
    source_stats = {sid: SourceStats(**s) for sid, s in raw_source_stats.items()}

    from core.skill_quality import SkillQualityStore
    from api.schemas import SkillEvalConfig as SkillEvalConfigSchema
    store = SkillQualityStore(agent_dir)
    latest_score = store.latest_score()
    quality_alert = store.is_alert(config.skill_eval.min_quality_threshold)

    return AgentDetail(
        agent_id=config.agent_id,
        model=config.model,
        analysis_mode=config.analysis_mode,
        sources=config.sources,
        consolidation_schedule=config.consolidation_schedule,
        decay=config.decay,
        collection_model=config.collection_model,
        consolidation_model=config.consolidation_model,
        soul=agent["soul"],
        self_improving=config.self_improving,
        plugin_version=config.plugin_version,
        skill_eval=SkillEvalConfigSchema(
            prompts=config.skill_eval.prompts,
            min_quality_threshold=config.skill_eval.min_quality_threshold,
            enabled=config.skill_eval.enabled,
        ),
        last_checked=state.last_checked,
        last_consolidation=state._data.get("last_consolidation"),
        inbox_count=len(inbox.read_items()),
        knowledge_count=len(knowledge_files),
        source_stats=source_stats,
        latest_quality_score=latest_score,
        quality_alert=quality_alert,
        has_soul_backup=(agent_dir / "soul_backup.md").exists(),
        paused=config.paused,
    )


def _reschedule_agent(agent: dict) -> None:
    """Remove old jobs for an agent and re-add them."""
    scheduler = get_scheduler()
    config = agent["config"]
    agent_id = config.agent_id

    # Remove existing jobs for this agent
    for job in scheduler.get_jobs():
        if job.id.startswith(agent_id):
            scheduler.remove_job(job.id)

    # Re-add jobs using build_scheduler logic
    build_scheduler([agent], scheduler)


@router.get("", response_model=list[AgentSummary])
def list_agents(request: Request):
    agents = _get_agents(request)
    return [_agent_summary(a) for a in agents.values()]


@router.get("/{agent_id}", response_model=AgentDetail)
def get_agent(agent_id: str, request: Request):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")
    return _agent_detail(agents[agent_id])


@router.post("", response_model=AgentDetail, status_code=201)
def create_agent(body: AgentConfigCreate, request: Request):
    agents = _get_agents(request)
    if body.agent_id in agents:
        raise HTTPException(409, f"Agent '{body.agent_id}' already exists")

    agent_dir = AGENTS_DIR / body.agent_id
    if agent_dir.resolve().parent != AGENTS_DIR.resolve():
        raise HTTPException(400, "Invalid agent_id")
    if agent_dir.exists():
        raise HTTPException(409, f"Agent directory already exists")

    agent_dir.mkdir(parents=True, exist_ok=True)

    config_data = {
        "agent_id": body.agent_id,
        "model": body.model,
        "analysis_mode": body.analysis_mode,
        "sources": body.sources,
        "consolidation_schedule": body.consolidation_schedule,
        "decay": body.decay.model_dump(),
        "collection_model": body.collection_model,
        "consolidation_model": body.consolidation_model,
        "self_improving": body.self_improving,
        "plugin_version": body.plugin_version,
        "skill_eval": body.skill_eval.model_dump(),
        "paused": False,
    }
    save_agent_config(agent_dir / "config.yaml", config_data)
    save_soul(agent_dir, body.soul)

    gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
    try:
        agent = load_agent(agent_dir, gemini_api_key=gemini_api_key)
    except Exception as e:
        shutil.rmtree(agent_dir)
        raise HTTPException(500, f"Failed to load agent: {e}")

    agents[body.agent_id] = agent
    _reschedule_agent(agent)
    logger.info(f"Created agent: {body.agent_id}")
    return _agent_detail(agent)


@router.put("/{agent_id}/config", response_model=AgentDetail)
def update_config(agent_id: str, body: AgentConfigUpdate, request: Request):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    agent_dir = agent["dir"]
    config = agent["config"]

    # Build updated config dict
    config_data = {
        "agent_id": config.agent_id,
        "model": body.model if body.model is not None else config.model,
        "analysis_mode": body.analysis_mode if body.analysis_mode is not None else config.analysis_mode,
        "sources": body.sources if body.sources is not None else config.sources,
        "consolidation_schedule": (
            body.consolidation_schedule if body.consolidation_schedule is not None else config.consolidation_schedule
        ),
        "decay": body.decay.model_dump() if body.decay is not None else config.decay,
        "collection_model": body.collection_model if body.collection_model is not None else config.collection_model,
        "consolidation_model": body.consolidation_model if body.consolidation_model is not None else config.consolidation_model,
        "self_improving": body.self_improving if body.self_improving is not None else config.self_improving,
        "plugin_version": body.plugin_version if body.plugin_version is not None else config.plugin_version,
        "skill_eval": (
            body.skill_eval.model_dump() if body.skill_eval is not None
            else {
                "prompts": config.skill_eval.prompts,
                "min_quality_threshold": config.skill_eval.min_quality_threshold,
                "enabled": config.skill_eval.enabled,
            }
        ),
        "paused": body.paused if body.paused is not None else config.paused,
    }
    save_agent_config(agent_dir / "config.yaml", config_data)

    # Reload agent
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
    new_agent = load_agent(agent_dir, gemini_api_key=gemini_api_key)
    agents[agent_id] = new_agent
    _reschedule_agent(new_agent)
    logger.info(f"Updated config for agent: {agent_id}")
    return _agent_detail(new_agent)


@router.put("/{agent_id}/soul", response_model=AgentDetail)
def update_soul(agent_id: str, body: SoulUpdate, request: Request):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    agent_dir = agent["dir"]
    save_soul_backup(agent_dir, agent["soul"])
    save_soul(agent_dir, body.soul)

    # Reload agent to pick up new soul
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
    new_agent = load_agent(agent_dir, gemini_api_key=gemini_api_key)
    agents[agent_id] = new_agent
    _reschedule_agent(new_agent)
    logger.info(f"Updated soul for agent: {agent_id}")
    return _agent_detail(new_agent)


@router.post("/{agent_id}/soul/integrate")
def integrate_soul(agent_id: str, body: SoulIntegrateRequest, request: Request):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")
    agent = agents[agent_id]
    integrated = agent["provider"].integrate_soul_suggestions(body.soul, body.suggestions)
    return {"integrated_soul": integrated}


def _set_agent_paused(agent_id: str, paused: bool, agents: dict) -> AgentDetail:
    """Write paused flag to config.yaml and reschedule (removes jobs if paused)."""
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")
    agent = agents[agent_id]
    agent_dir = agent["dir"]
    config = agent["config"]
    config_data = {
        "agent_id": config.agent_id,
        "model": config.model,
        "analysis_mode": config.analysis_mode,
        "sources": config.sources,
        "consolidation_schedule": config.consolidation_schedule,
        "decay": config.decay,
        "collection_model": config.collection_model,
        "consolidation_model": config.consolidation_model,
        "self_improving": config.self_improving,
        "skill_eval": {
            "prompts": config.skill_eval.prompts,
            "min_quality_threshold": config.skill_eval.min_quality_threshold,
            "enabled": config.skill_eval.enabled,
        },
        "paused": paused,
    }
    save_agent_config(agent_dir / "config.yaml", config_data)
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
    new_agent = load_agent(agent_dir, gemini_api_key=gemini_api_key)
    agents[agent_id] = new_agent
    _reschedule_agent(new_agent)
    logger.info(f"Agent '{agent_id}' {'paused' if paused else 'resumed'}")
    return _agent_detail(new_agent)


@router.post("/{agent_id}/pause", response_model=AgentDetail)
def pause_agent(agent_id: str, request: Request):
    return _set_agent_paused(agent_id, True, _get_agents(request))


@router.post("/{agent_id}/resume", response_model=AgentDetail)
def resume_agent(agent_id: str, request: Request):
    return _set_agent_paused(agent_id, False, _get_agents(request))


@router.post("/{agent_id}/soul/preview-eval")
def preview_soul_eval(agent_id: str, body: SoulPreviewEvalRequest, request: Request):
    """Generate a candidate SKILL.md for a proposed soul and measure quality impact.

    Returns the baseline score (from the last consolidation) and the candidate score,
    so the user can see the quality impact before applying the soul change.
    No files are written.
    """
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")
    agent = agents[agent_id]
    config = agent["config"]
    skill_cfg = config.skill_eval
    if not (skill_cfg.enabled and skill_cfg.prompts):
        raise HTTPException(400, "Skill evaluation is not configured for this agent")

    agent_dir = agent["dir"]
    from core.skill_quality import SkillQualityStore
    store = SkillQualityStore(agent_dir)
    score_before = store.latest_score()

    digest_path = agent_dir / "digest.md"
    if not digest_path.exists():
        raise HTTPException(400, "No digest.md found — run consolidation first")
    digest = digest_path.read_text("utf-8")

    from core.skill_regression_analyzer import read_learnings
    learnings = read_learnings(agent_dir)

    candidate_skill = agent["provider"].generate_skill(
        digest, body.soul, config.agent_id, learnings=learnings
    )
    result = agent["provider"].evaluate_skill(candidate_skill, skill_cfg.prompts, body.soul)

    return {
        "score_before": score_before,
        "score_after": result.score,
        "delta": round(result.score - score_before, 4) if score_before is not None else None,
        "per_prompt_results": [
            {
                "prompt": r.prompt,
                "with_skill_score": r.with_skill_score,
                "without_skill_score": r.without_skill_score,
                "delta": r.delta,
                "grader_reasoning": r.grader_reasoning,
            }
            for r in result.eval_results
        ],
    }


@router.post("/{agent_id}/soul/revert", response_model=AgentDetail)
def revert_soul(agent_id: str, request: Request):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")
    agent = agents[agent_id]
    agent_dir = agent["dir"]
    backup = restore_soul_backup(agent_dir)
    if backup is None:
        raise HTTPException(404, "No backup available")
    save_soul(agent_dir, backup)
    (agent_dir / "soul_backup.md").unlink()
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
    new_agent = load_agent(agent_dir, gemini_api_key=gemini_api_key)
    agents[agent_id] = new_agent
    _reschedule_agent(new_agent)
    return _agent_detail(new_agent)


@router.get("/{agent_id}/discovered-sources")
def get_discovered_sources(agent_id: str, request: Request):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")
    agent_dir = agents[agent_id]["dir"]
    discovered_path = agent_dir / "discovered_sources.md"
    if not discovered_path.exists():
        return {"content": ""}
    return {"content": discovered_path.read_text(encoding="utf-8")}


@router.delete("/{agent_id}", status_code=204)
def delete_agent(agent_id: str, request: Request):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    agent_dir = agent["dir"]

    # Remove scheduled jobs
    scheduler = get_scheduler()
    for job in scheduler.get_jobs():
        if job.id.startswith(agent_id):
            scheduler.remove_job(job.id)

    # Remove from in-memory registry
    del agents[agent_id]

    # Remove directory
    shutil.rmtree(agent_dir)
    logger.info(f"Deleted agent: {agent_id}")


@router.post("/{agent_id}/ingest/url", status_code=202)
def ingest_url(
    agent_id: str,
    body: IngestUrlRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, detail=f"Agent '{agent_id}' not found")
    pipeline = agents[agent_id].get("ingestion")
    if not pipeline:
        raise HTTPException(500, detail="Ingestion pipeline not available")
    background_tasks.add_task(pipeline.run_url, body.url, body.title)
    return {"status": "queued", "agent_id": agent_id, "url": body.url}


@router.post("/{agent_id}/ingest/file", status_code=202)
async def ingest_file(
    agent_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    file: UploadFile = File(...),
    title: str | None = Form(None),
):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, detail=f"Agent '{agent_id}' not found")
    pipeline = agents[agent_id].get("ingestion")
    if not pipeline:
        raise HTTPException(500, detail="Ingestion pipeline not available")
    file_bytes = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    background_tasks.add_task(pipeline.run_file, file_bytes, mime_type, file.filename, title)
    return {"status": "queued", "agent_id": agent_id, "filename": file.filename}


@router.post("/{agent_id}/ingest/channel/preview")
def ingest_channel_preview(
    agent_id: str,
    body: IngestChannelExecuteRequest,
    request: Request,
):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, detail=f"Agent '{agent_id}' not found")
    try:
        videos = get_channel_videos(body.url, body.limit)
    except DownloadError as exc:
        raise HTTPException(422, detail=f"Could not fetch channel: {exc}")
    return {"count": len(videos), "videos": videos}


@router.get("/{agent_id}/skill-quality")
def get_skill_quality(agent_id: str, request: Request):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")
    from core.skill_quality import SkillQualityStore
    store = SkillQualityStore(agents[agent_id]["dir"])
    return {"history": store.history()}


@router.get("/{agent_id}/soul-suggestions")
def get_soul_suggestions(agent_id: str, request: Request):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")
    path = agents[agent_id]["dir"] / "soul_suggestions.md"
    if not path.exists():
        return {"suggestions": None}
    return {"suggestions": path.read_text(encoding="utf-8")}


@router.post("/{agent_id}/sources/{source_id}/reset-status")
def reset_source_status(agent_id: str, source_id: str, request: Request):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")
    agent_dir = agents[agent_id]["dir"]
    state = AgentState(agent_dir)
    state.set_source_status(source_id, "active", None)
    state.save()
    return {"status": "ok", "source_id": source_id, "new_status": "active"}


@router.post("/{agent_id}/ingest/channel/execute", status_code=202)
def ingest_channel_execute(
    agent_id: str,
    body: IngestChannelExecuteRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, detail=f"Agent '{agent_id}' not found")
    pipeline = agents[agent_id].get("ingestion")
    if not pipeline:
        raise HTTPException(500, detail="Ingestion pipeline not available")
    background_tasks.add_task(pipeline.run_channel, body.url, body.limit)
    return {"status": "queued", "agent_id": agent_id, "url": body.url}
