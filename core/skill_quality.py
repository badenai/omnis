import json
import pathlib
from core.models.types import SkillEvalResult

_MAX_HISTORY = 52


class SkillQualityStore:
    def __init__(self, agent_dir: pathlib.Path):
        self._path = agent_dir / "skill_quality.json"
        self._history: list[dict] = self._load()

    def _load(self) -> list[dict]:
        if self._path.exists():
            try:
                return json.loads(self._path.read_text(encoding="utf-8"))
            except Exception:
                return []
        return []

    def _save(self) -> None:
        self._path.write_text(json.dumps(self._history, indent=2), encoding="utf-8")

    def append(self, result: SkillEvalResult) -> None:
        entry = {
            "score": result.score,
            "skill_version": result.skill_version,
            "timestamp": result.timestamp,
            "eval_results": [
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
        self._history.insert(0, entry)
        self._history = self._history[:_MAX_HISTORY]
        self._save()

    def latest_score(self) -> float | None:
        if not self._history:
            return None
        return self._history[0]["score"]

    def is_alert(self, threshold: float) -> bool:
        if not self._history:
            return False
        latest = self._history[0]["score"]
        if latest < threshold:
            return True
        if len(self._history) >= 2:
            previous = self._history[1]["score"]
            if previous > 0 and (previous - latest) / previous > 0.20:
                return True
        return False

    def history(self) -> list[dict]:
        return list(self._history)
