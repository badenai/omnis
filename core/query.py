import pathlib
import re
from datetime import datetime, timezone, timedelta, date

import frontmatter

_RECENT_KEYWORDS = {"latest", "recent", "trend", "today", "this week", "current", "new", "now", "last"}
_MAX_RECENT_FILES = 20
_RECENT_DAYS = 30


def _matches_recent(question: str) -> bool:
    q = question.lower()
    for kw in _RECENT_KEYWORDS:
        if " " in kw:
            if kw in q:
                return True
        else:
            if re.search(rf"\b{re.escape(kw)}", q):
                return True
    return False


class QueryHandler:
    def __init__(self, agent_dir: pathlib.Path, soul: str):
        self._dir = agent_dir
        self._soul = soul

    def select_tier(self, question: str) -> int:
        """Return context tier: 1=memory only, 2=memory+recent files."""
        if _matches_recent(question):
            return 2
        return 1

    def build_context(self, tier: int) -> tuple[str, list[str]]:
        """Returns (context_text, list_of_source_paths)."""
        parts: list[str] = []
        sources: list[str] = []

        memory_path = self._dir / "digest.md"

        if memory_path.exists():
            parts.append(memory_path.read_text(encoding="utf-8"))
            sources.append(memory_path.name)

        if tier >= 2:
            # Add recent knowledge files within the cutoff window
            recent_dir = self._dir / "knowledge" / "recent"
            cutoff = datetime.now(timezone.utc).date() - timedelta(days=_RECENT_DAYS)
            if recent_dir.exists():
                candidates = sorted(recent_dir.rglob("*.md"), reverse=True)
                added = 0
                for md in candidates:
                    if added >= _MAX_RECENT_FILES:
                        break
                    try:
                        post = frontmatter.load(str(md))
                        created_str = post.get("created", "")
                        if created_str:
                            created = date.fromisoformat(str(created_str))
                            if created >= cutoff:
                                rel = str(md.relative_to(self._dir))
                                parts.append(f"### {md.stem}\n{post.content}")
                                sources.append(rel)
                                added += 1
                    except Exception:
                        pass

        return "\n\n".join(parts), sources

    def build_system_prompt(self, context: str) -> str:
        if context:
            return (
                f"You are a knowledge expert. Your identity and focus:\n\n{self._soul}\n\n"
                "Answer based on your accumulated knowledge below. "
                "When you reference specific knowledge, mention the source file name. "
                "If asked about recent trends, emphasize newer findings. "
                "If your knowledge does not cover something, say so honestly.\n\n"
                f"## Your Knowledge\n\n{context}"
            )
        return (
            f"You are a knowledge expert. Your identity and focus:\n\n{self._soul}\n\n"
            "Your knowledge base is currently empty. "
            "Tell the user to run collection first to build up your knowledge."
        )
