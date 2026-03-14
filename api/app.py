import os
import pathlib
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import JSONResponse
from starlette.types import Receive, Scope, Send

from core.agent_loader import load_agent
from core.constants import APP_NAME, DATA_DIR
from core.scheduler import build_scheduler
from core.scheduler_instance import set_scheduler, get_scheduler
from api.routers import agents, scheduler, knowledge, query, soul_assistant

logger = logging.getLogger(__name__)

AGENTS_DIR = DATA_DIR / "agents"


class _MCPProxy:
    """Lazy ASGI proxy for /mcp — delegates to app.state.mcp_asgi once the
    lifespan has finished loading agents and building the MCP server.

    Registered before the static-files catch-all in create_app() so that
    route matching finds /mcp before /.
    """

    def __init__(self, app: FastAPI) -> None:
        self._app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Lifespan events are driven by the outer FastAPI app — don't forward
        # them to the sub-app or the inner Starlette lifespan will conflict.
        if scope["type"] == "lifespan":
            return
        mcp_asgi: Any = getattr(self._app.state, "mcp_asgi", None)
        if mcp_asgi is None:
            response = JSONResponse({"detail": "MCP not ready yet"}, status_code=503)
            await response(scope, receive, send)
            return
        await mcp_asgi(scope, receive, send)


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

    from core.mcp_server import build_mcp_server
    mcp = build_mcp_server(loaded_agents)
    app.state.mcp_asgi = mcp.sse_app("/mcp")
    logger.info("MCP server ready at /mcp/sse")

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
    app = FastAPI(title=APP_NAME.capitalize(), version="0.1.0", lifespan=lifespan)

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
    app.include_router(query.router)
    app.include_router(soul_assistant.router)

    # Mount MCP proxy before the static-files catch-all so /mcp is reachable.
    # The proxy delegates to app.state.mcp_asgi once the lifespan sets it up.
    app.mount("/mcp", _MCPProxy(app))

    # Serve frontend build if it exists
    dist_dir = pathlib.Path(__file__).resolve().parent.parent / "web" / "dist"
    if dist_dir.is_dir():
        app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")

    return app
