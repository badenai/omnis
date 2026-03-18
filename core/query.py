import pathlib

import frontmatter


class QueryHandler:
    def __init__(self, agent_dir: pathlib.Path, soul: str):
        self._dir = agent_dir
        self._soul = soul

    def build_context(self) -> tuple[str, list[str]]:
        """Always loads digest + _index so the model knows what files exist."""
        parts: list[str] = []
        sources: list[str] = []
        for name in ("digest.md", "knowledge/_index.md"):
            path = self._dir / name
            if path.exists():
                parts.append(path.read_text(encoding="utf-8"))
                sources.append(name)
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
