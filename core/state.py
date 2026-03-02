import json
import pathlib
from datetime import datetime, timezone


class AgentState:
    def __init__(self, agent_dir: pathlib.Path):
        self._path = agent_dir / "state.json"
        self._data = self._load()

    def _load(self) -> dict:
        if self._path.exists():
            data = json.loads(self._path.read_text(encoding="utf-8"))
            data.setdefault("agent_score_average", 0.0)
            data.setdefault("source_stats", {})
            return data
        return {
            "processed_video_ids": [],
            "last_checked": {},
            "last_consolidation": None,
            "agent_score_average": 0.0,
            "source_stats": {},
        }

    @property
    def processed_ids(self) -> set:
        return set(self._data["processed_video_ids"])

    @property
    def last_checked(self) -> dict:
        return self._data["last_checked"]

    def mark_processed(self, video_id: str) -> None:
        if video_id not in self._data["processed_video_ids"]:
            self._data["processed_video_ids"].append(video_id)

    def update_last_checked(self, channel_handle: str, timestamp: str) -> None:
        self._data["last_checked"][channel_handle] = timestamp

    def update_last_consolidation(self) -> None:
        self._data["last_consolidation"] = datetime.now(timezone.utc).isoformat()

    def record_source_score(self, source_id: str, score: float) -> None:
        stats = self._data["source_stats"].setdefault(source_id, self._default_source_stats())
        stats["scores"].append(score)
        if len(stats["scores"]) > 20:
            stats["scores"] = stats["scores"][-20:]

    def record_source_credibility_flag(self, source_id: str, signals: object) -> None:
        stats = self._data["source_stats"].setdefault(source_id, self._default_source_stats())
        flags = stats["credibility_flags"]
        if getattr(signals, "hype_pattern", False):
            flags["hype_pattern"] = flags.get("hype_pattern", 0) + 1
        if getattr(signals, "unverified_claims", False):
            flags["unverified_claims"] = flags.get("unverified_claims", 0) + 1

    def set_source_status(self, source_id: str, status: str, reason: str | None) -> None:
        from datetime import datetime, timezone
        stats = self._data["source_stats"].setdefault(source_id, self._default_source_stats())
        stats["status"] = status
        stats["flagged_reason"] = reason
        stats["flagged_at"] = datetime.now(timezone.utc).isoformat() if reason else None

    def recompute_agent_average(self) -> None:
        averages = []
        for stats in self._data["source_stats"].values():
            scores = stats.get("scores", [])
            if scores:
                averages.append(sum(scores) / len(scores))
        self._data["agent_score_average"] = sum(averages) / len(averages) if averages else 0.0

    def get_source_stats(self, source_id: str) -> dict:
        return self._data["source_stats"].get(source_id, self._default_source_stats())

    @staticmethod
    def _default_source_stats() -> dict:
        return {
            "scores": [],
            "credibility_flags": {"hype_pattern": 0, "unverified_claims": 0},
            "status": "active",
            "flagged_reason": None,
            "flagged_at": None,
        }

    def save(self) -> None:
        self._path.write_text(json.dumps(self._data, indent=2), encoding="utf-8")
