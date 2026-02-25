import json
import pathlib
from datetime import datetime, timezone


class AgentState:
    def __init__(self, agent_dir: pathlib.Path):
        self._path = agent_dir / "state.json"
        self._data = self._load()

    def _load(self) -> dict:
        if self._path.exists():
            return json.loads(self._path.read_text(encoding="utf-8"))
        return {"processed_video_ids": [], "last_checked": {}, "last_consolidation": None}

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

    def save(self) -> None:
        self._path.write_text(json.dumps(self._data, indent=2), encoding="utf-8")
