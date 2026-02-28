import os
import shutil
import pathlib
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, UploadFile, File, Form

from core.config import load_agent_config, load_soul, save_agent_config, save_soul
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
    SoulUpdate,
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

    return AgentSummary(
        agent_id=config.agent_id,
        mode=config.mode,
        model=config.model,
        analysis_mode=config.analysis_mode,
        consolidation_schedule=config.consolidation_schedule,
        channel_count=len(config.sources.get("youtube_channels", [])),
        last_consolidation=state._data.get("last_consolidation"),
        inbox_count=len(inbox.read_items()),
        knowledge_count=len(knowledge_files),
    )


def _agent_detail(agent: dict) -> AgentDetail:
    config = agent["config"]
    agent_dir = agent["dir"]
    state = AgentState(agent_dir)
    inbox = InboxWriter(agent_dir)
    kw = KnowledgeWriter(agent_dir, config.decay.get("half_life_days", 365))
    knowledge_files = kw.load_all_weighted()

    return AgentDetail(
        agent_id=config.agent_id,
        mode=config.mode,
        model=config.model,
        analysis_mode=config.analysis_mode,
        sources=config.sources,
        consolidation_schedule=config.consolidation_schedule,
        decay=config.decay,
        collection_model=config.collection_model,
        consolidation_model=config.consolidation_model,
        soul=agent["soul"],
        research=config.research,
        last_checked=state.last_checked,
        last_consolidation=state._data.get("last_consolidation"),
        inbox_count=len(inbox.read_items()),
        knowledge_count=len(knowledge_files),
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
    if agent_dir.exists():
        raise HTTPException(409, f"Agent directory already exists")

    agent_dir.mkdir(parents=True, exist_ok=True)

    config_data = {
        "agent_id": body.agent_id,
        "mode": body.mode,
        "model": body.model,
        "analysis_mode": body.analysis_mode,
        "sources": {
            "youtube_channels": [ch.model_dump() for ch in body.sources.youtube_channels]
        },
        "consolidation_schedule": body.consolidation_schedule,
        "decay": body.decay.model_dump(),
        "collection_model": body.collection_model,
        "consolidation_model": body.consolidation_model,
        "research": body.research.model_dump(),
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
        "mode": body.mode if body.mode is not None else config.mode,
        "model": body.model if body.model is not None else config.model,
        "analysis_mode": body.analysis_mode if body.analysis_mode is not None else config.analysis_mode,
        "sources": (
            {"youtube_channels": [ch.model_dump() for ch in body.sources.youtube_channels]}
            if body.sources is not None
            else config.sources
        ),
        "consolidation_schedule": (
            body.consolidation_schedule if body.consolidation_schedule is not None else config.consolidation_schedule
        ),
        "decay": body.decay.model_dump() if body.decay is not None else config.decay,
        "collection_model": body.collection_model if body.collection_model is not None else config.collection_model,
        "consolidation_model": body.consolidation_model if body.consolidation_model is not None else config.consolidation_model,
        "research": body.research.model_dump() if body.research is not None else config.research,
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
    save_soul(agent_dir, body.soul)

    # Reload agent to pick up new soul
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
    new_agent = load_agent(agent_dir, gemini_api_key=gemini_api_key)
    agents[agent_id] = new_agent
    _reschedule_agent(new_agent)
    logger.info(f"Updated soul for agent: {agent_id}")
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
