import hashlib
import json
import pathlib
from datetime import datetime, timezone


def append(
    agent_dir: pathlib.Path,
    soul_before: str,
    soul_after: str,
    skill_score_before: float | None,
    skill_score_after: float | None,
    action: str,
    suggestions_count: int,
) -> None:
    """Append one soul experiment result to soul_experiments.jsonl (append-only log).

    Fields:
      timestamp            — ISO UTC
      soul_hash_before/after — first 8 chars of SHA-256 (for identity, not security)
      skill_score_before/after — float 0-1, None if unavailable
      action               — "keep" | "discard"
      suggestions_count    — how many ## sections were in the suggestions file
    """
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "soul_hash_before": hashlib.sha256(soul_before.encode()).hexdigest()[:8],
        "soul_hash_after": hashlib.sha256(soul_after.encode()).hexdigest()[:8],
        "skill_score_before": skill_score_before,
        "skill_score_after": skill_score_after,
        "action": action,
        "suggestions_count": suggestions_count,
    }
    log_path = agent_dir / "soul_experiments.jsonl"
    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
