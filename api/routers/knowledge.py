import pathlib
import logging

from fastapi import APIRouter, HTTPException, Query, Request

from core.knowledge import KnowledgeWriter
from api.schemas import KnowledgeFile, KnowledgeFileContent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


def _get_agent(agent_id: str, request: Request) -> dict:
    agents = request.app.state.agents
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")
    return agents[agent_id]


@router.get("/{agent_id}", response_model=list[KnowledgeFile])
def list_knowledge(agent_id: str, request: Request):
    agent = _get_agent(agent_id, request)
    config = agent["config"]
    kw = KnowledgeWriter(agent["dir"], config.decay.get("half_life_days", 365))
    files = kw.load_all_weighted()
    return [
        KnowledgeFile(
            path=f["path"],
            effective_weight=f["effective_weight"],
            metadata=f["metadata"],
        )
        for f in files
    ]


@router.get("/{agent_id}/file", response_model=KnowledgeFileContent)
def read_knowledge_file(agent_id: str, path: str = Query(...), request: Request = None):
    agent = _get_agent(agent_id, request)
    config = agent["config"]
    kw = KnowledgeWriter(agent["dir"], config.decay.get("half_life_days", 365))
    files = kw.load_all_weighted()

    for f in files:
        if f["path"] == path:
            return KnowledgeFileContent(
                path=f["path"],
                content=f["content"],
                effective_weight=f["effective_weight"],
                metadata=f["metadata"],
            )
    raise HTTPException(404, f"Knowledge file '{path}' not found")


@router.get("/{agent_id}/skill")
def read_skill(agent_id: str, request: Request):
    agent = _get_agent(agent_id, request)
    skill_path = agent["dir"] / "SKILL.md"
    if not skill_path.exists():
        raise HTTPException(404, "SKILL.md not found")
    return {"content": skill_path.read_text(encoding="utf-8")}


@router.get("/{agent_id}/digest")
def read_digest(agent_id: str, request: Request):
    agent = _get_agent(agent_id, request)
    digest_path = agent["dir"] / "digest.md"
    if not digest_path.exists():
        raise HTTPException(404, "digest.md not found")
    return {"content": digest_path.read_text(encoding="utf-8")}


@router.get("/{agent_id}/inbox")
def read_inbox(agent_id: str, request: Request):
    agent = _get_agent(agent_id, request)
    from core.inbox import InboxWriter
    inbox = InboxWriter(agent["dir"])
    items = inbox.read_items()
    return {"items": items, "count": len(items)}


@router.get("/{agent_id}/session-report")
def read_session_report(agent_id: str, request: Request):
    agent = _get_agent(agent_id, request)
    path = agent["dir"] / "last_session.md"
    if not path.exists():
        raise HTTPException(404, "last_session.md not found")
    return {"content": path.read_text(encoding="utf-8")}


def _read_diff(agent_dir: pathlib.Path, current_name: str, previous_name: str) -> dict:
    current_path = agent_dir / current_name
    if not current_path.exists():
        raise HTTPException(404, f"{current_name} not found")
    previous_path = agent_dir / previous_name
    old_content = previous_path.read_text(encoding="utf-8") if previous_path.exists() else None
    return {"old_content": old_content, "new_content": current_path.read_text(encoding="utf-8")}


@router.get("/{agent_id}/skill-diff")
def read_skill_diff(agent_id: str, request: Request):
    agent = _get_agent(agent_id, request)
    return _read_diff(agent["dir"], "SKILL.md", "SKILL.previous.md")


@router.get("/{agent_id}/digest-diff")
def read_digest_diff(agent_id: str, request: Request):
    agent = _get_agent(agent_id, request)
    return _read_diff(agent["dir"], "digest.md", "digest.previous.md")


@router.get("/{agent_id}/quality")
def read_skill_quality(agent_id: str, request: Request):
    agent = _get_agent(agent_id, request)
    from core.skill_quality import SkillQualityStore
    config = agent["config"]
    store = SkillQualityStore(agent["dir"])
    threshold = config.skill_eval.min_quality_threshold
    return {
        "history": store.history(),
        "latest_score": store.latest_score(),
        "alert": store.is_alert(threshold),
    }


@router.get("/{agent_id}/audit")
def read_skill_audit(agent_id: str, request: Request):
    agent = _get_agent(agent_id, request)
    audit_path = agent["dir"] / "skill_audit.json"
    if not audit_path.exists():
        raise HTTPException(404, "No audit data — run 'Audit Skill' first")
    import json
    return json.loads(audit_path.read_text(encoding="utf-8"))


@router.get("/{agent_id}/search")
def search_knowledge(agent_id: str, q: str = Query(..., min_length=1), request: Request = None):
    agent = _get_agent(agent_id, request)
    config = agent["config"]
    kw = KnowledgeWriter(agent["dir"], config.decay.get("half_life_days", 365))
    files = kw.load_all_weighted()

    query_lower = q.lower()
    results = []
    for f in files:
        if query_lower in f["content"].lower() or query_lower in f["path"].lower():
            results.append(KnowledgeFileContent(
                path=f["path"],
                content=f["content"],
                effective_weight=f["effective_weight"],
                metadata=f["metadata"],
            ))
    return results
