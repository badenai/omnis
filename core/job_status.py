"""Thread-safe in-memory tracker for pipeline activity."""
import threading
from datetime import datetime, timezone

_lock = threading.Lock()
_active: dict[str, dict] = {}   # key: "{agent_id}/{task}"
_history: list[dict] = []
_MAX_HISTORY = 30


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def start(agent_id: str, task: str, step: str = "Starting...") -> None:
    key = f"{agent_id}/{task}"
    with _lock:
        _active[key] = {
            "key": key,
            "agent_id": agent_id,
            "task": task,
            "step": step,
            "started_at": _now(),
            "state": "running",
            "error": None,
            "finished_at": None,
        }


def update_step(agent_id: str, task: str, step: str) -> None:
    key = f"{agent_id}/{task}"
    with _lock:
        if key in _active:
            _active[key]["step"] = step


def complete(agent_id: str, task: str) -> None:
    key = f"{agent_id}/{task}"
    with _lock:
        entry = _active.pop(key, None)
        if entry:
            entry.update(state="completed", finished_at=_now())
            _history.insert(0, dict(entry))
            del _history[_MAX_HISTORY:]


def fail(agent_id: str, task: str, error: str) -> None:
    key = f"{agent_id}/{task}"
    with _lock:
        entry = _active.pop(key, None)
        if entry:
            entry.update(state="failed", finished_at=_now(), error=error)
            _history.insert(0, dict(entry))
            del _history[_MAX_HISTORY:]


def get_active() -> list[dict]:
    with _lock:
        return list(_active.values())


def get_history() -> list[dict]:
    with _lock:
        return list(_history)
