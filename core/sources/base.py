from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class SourceItem:
    source_id: str          # unique ID per item (video ID, article hash, post ID…)
    title: str
    content: str            # text ready for analysis
    source_url: str | None = None
    analysis_mode: str = "text"   # "text" | "full_video" (YouTube only)


class SourcePlugin(Protocol):
    """Protocol for pluggable knowledge sources (YouTube, Medium, web page, Reddit, etc.)."""

    source_type: str

    def get_source_id(self, config: dict) -> str:
        """Canonical key for this source (used in state.json, logs, UI)."""
        ...

    def fetch(self, config: dict, processed_ids: set[str]) -> list[SourceItem]:
        """Return unprocessed items. Must skip IDs in processed_ids."""
        ...
