import json
import logging
import os

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.models.gemini import GeminiProvider

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/soul-assistant", tags=["soul-assistant"])

_SYSTEM_PROMPT_TEMPLATE = """You are an expert Omnis soul architect. Your job is to help users craft excellent SOUL.md files for their Omnis knowledge agents.

SOUL.md BEST PRACTICES:
- Be specific about what the agent should focus on — vague souls produce low-relevance knowledge
- Include explicit "Focus on:" bullet list (topics, techniques, frameworks, people worth following)
- Include explicit "Ignore:" section (hype, off-topic content, low-signal noise)
- Use concrete domain-specific terms and keywords so the AI knows what relevance means for this domain
- Keep it under 400 words — clarity beats length

GENERATING A SOUL DRAFT:
When generating a complete SOUL.md, always wrap it in a markdown code block:
```markdown
# <Agent Name> Soul
...
```
This allows the user to click "Apply to Editor" with one click.

GENERATING EVAL QUESTIONS:
When asked to suggest evaluation questions, output a numbered list of 3–5 prompts that test whether the skill is actually useful for this domain. Questions should be specific enough that a generic answer would score poorly.

CURRENT SOUL DRAFT (may be empty for new agents):
{current_soul}"""


class SoulAssistantRequest(BaseModel):
    current_soul: str = ""
    message: str
    history: list[dict] = []
    agent_id: str | None = None


@router.post("/stream")
async def stream_soul_assistant(body: SoulAssistantRequest, request: Request):
    agents = getattr(request.app.state, "agents", {})

    if body.agent_id and body.agent_id in agents:
        provider: GeminiProvider = agents[body.agent_id]["provider"]
    else:
        api_key = os.environ.get("GEMINI_API_KEY", "")
        provider = GeminiProvider(api_key=api_key)

    system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(
        current_soul=body.current_soul or "(empty)"
    )

    def event_stream():
        try:
            for token in provider.stream_query(system_prompt, body.message, body.history, [], {}):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Soul assistant stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
