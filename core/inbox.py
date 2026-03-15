import pathlib
from datetime import datetime, timezone
from core.models.types import AnalysisResult

_SEPARATOR = "\n<!-- INBOX_ENTRY_SEPARATOR -->\n"


class InboxWriter:
    def __init__(self, agent_dir: pathlib.Path):
        self._path = agent_dir / "INBOX.md"

    def append(self, channel: str, result: AnalysisResult, sources: list[str] | None = None) -> None:
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        insights_md = "\n".join(f"- {i}" for i in result.insights)
        sources_line = f"**Sources:** {', '.join(sources)}\n" if sources else ""
        entry = (
            f"## {now} | {channel} | {result.video_id}\n"
            f"**Title:** {result.video_title}  \n"
            f"**Relevance Score:** {result.relevance_score}  \n"
            f"**Suggested Action:** {result.suggested_action} -> `{result.suggested_target}`\n"
            f"{sources_line}\n"
            f"### Key Insights\n{insights_md}\n\n"
            f"### Summary\n{result.raw_summary}\n"
        )
        existing = self._path.read_text(encoding="utf-8") if self._path.exists() else ""
        if existing:
            content = existing + _SEPARATOR + entry
        else:
            content = entry
        self._path.write_text(content, encoding="utf-8")

    def read_items(self) -> list[str]:
        if not self._path.exists():
            return []
        content = self._path.read_text(encoding="utf-8")
        return [item.strip() for item in content.split(_SEPARATOR) if item.strip()]

    def clear(self) -> None:
        if self._path.exists():
            self._path.unlink()
