import os
import shutil
import pathlib
import logging

from fastapi import APIRouter, HTTPException, Request

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
    SoulUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agents", tags=["agents"])

WORKSPACE = pathlib.Path.home() / ".cloracle"
AGENTS_DIR = WORKSPACE / "agents"


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
        soul=agent["soul"],
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
