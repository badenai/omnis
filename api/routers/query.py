import json
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.query import QueryHandler

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/query", tags=["query"])


class QueryRequest(BaseModel):
    message: str
    history: list[dict] = []


@router.post("/{agent_id}")
async def query_agent(agent_id: str, body: QueryRequest, request: Request):
    agents = request.app.state.agents
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    soul = agent.get("soul", "")
    provider = agent["provider"]

    qh = QueryHandler(agent_dir=agent["dir"], soul=soul)
    tier = qh.select_tier(body.message)
    context, sources = qh.build_context(tier=tier)
    system_prompt = qh.build_system_prompt(context)

    def event_stream():
        try:
            for token in provider.stream_query(system_prompt, body.message, body.history):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield f"data: {json.dumps({'sources': sources})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Query stream error for {agent_id}: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
