import json
import pathlib
from datetime import datetime, timezone


class Registry:
    def __init__(self, registry_path: pathlib.Path):
        self._path = registry_path
        self._data = self._load()

    def _load(self) -> dict:
        if self._path.exists():
            return json.loads(self._path.read_text(encoding="utf-8"))
        return {"agents": {}}

    @property
    def agents(self) -> dict:
        return self._data["agents"]

    def register(self, agent_id: str, skill_path: pathlib.Path) -> None:
        self._data["agents"][agent_id] = {
            "skill_path": str(skill_path),
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

    def save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._data, indent=2), encoding="utf-8")
