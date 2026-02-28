from dataclasses import dataclass
from typing import Protocol


@dataclass
class SourceItem:
    content: str            # transcript or text content
    source_id: str          # unique ID (video ID, URL hash, etc.)
    title: str
    source_url: str | None = None


class SourcePlugin(Protocol):
    """Protocol for pluggable knowledge sources (YouTube, URL, RSS, file, etc.)."""

    source_type: str

    async def fetch(self, config: dict) -> list[SourceItem]:
        """Fetch items from this source given the agent source config."""
        ...
