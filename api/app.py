import os
import pathlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.agent_loader import load_agent
from core.scheduler import build_scheduler
from core.scheduler_instance import set_scheduler, get_scheduler
from api.routers import agents, scheduler, knowledge

logger = logging.getLogger(__name__)

WORKSPACE = pathlib.Path.home() / ".cloracle"
AGENTS_DIR = WORKSPACE / "agents"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
    AGENTS_DIR.mkdir(parents=True, exist_ok=True)

    loaded_agents: dict[str, dict] = {}
    for agent_dir in sorted(AGENTS_DIR.iterdir()):
        if not agent_dir.is_dir():
            continue
        if not (agent_dir / "config.yaml").exists():
            continue
        try:
            logger.info(f"Loading agent: {agent_dir.name}")
            agent = load_agent(agent_dir, gemini_api_key=gemini_api_key)
            loaded_agents[agent["config"].agent_id] = agent
        except Exception as e:
            logger.error(f"Failed to load agent {agent_dir.name}: {e}")

    app.state.agents = loaded_agents

    sched = build_scheduler(list(loaded_agents.values()))
    set_scheduler(sched)
    sched.start()
    logger.info(f"API started with {len(loaded_agents)} agent(s)")

    yield

    # Shutdown
    try:
        sched = get_scheduler()
        sched.shutdown(wait=False)
    except RuntimeError:
        pass
    logger.info("API shut down")


def create_app() -> FastAPI:
    app = FastAPI(title="Cloracle", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(agents.router)
    app.include_router(scheduler.router)
    app.include_router(knowledge.router)

    # Serve frontend build if it exists
    dist_dir = pathlib.Path(__file__).resolve().parent.parent / "web" / "dist"
    if dist_dir.is_dir():
        app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")

    return app
