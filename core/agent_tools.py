"""
Agent tool registry — all tools available to agents during chat interactions.

Each tool section exports a function:
    build_<name>_tool(agent_dir: Path) -> tuple[FunctionDeclaration, callable]

The top-level `build_tools(agent_dir)` assembles all tools into the lists
expected by `stream_query`.
"""

import pathlib

import frontmatter
from google.genai import types as gtypes

_SEARCH_RESULT_CAP = 10
_SNIPPET_BEFORE = 100
_SNIPPET_AFTER = 200


def build_read_knowledge_file_tool(agent_dir: pathlib.Path):
    knowledge_root = (agent_dir / "knowledge").resolve()

    def read_knowledge_file(path: str) -> str:
        if ".." in path or path.startswith("/"):
            return "Error: invalid path"
        full = (knowledge_root / path).resolve()
        if not full.is_relative_to(knowledge_root):
            return "Error: path outside knowledge directory"
        if not full.exists() or full.suffix != ".md":
            return f"Error: file not found: {path}"
        try:
            return frontmatter.load(str(full)).content
        except Exception as e:
            return f"Error: {e}"

    declaration = gtypes.FunctionDeclaration(
        name="read_knowledge_file",
        description=(
            "Read the full content of a specific knowledge file. "
            "Use the knowledge index (in your context) to find available paths."
        ),
        parameters={
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path from knowledge/, e.g. 'concepts/foo.md'",
                }
            },
            "required": ["path"],
        },
    )
    return declaration, read_knowledge_file


def build_search_knowledge_tool(agent_dir: pathlib.Path):
    knowledge_root = (agent_dir / "knowledge").resolve()

    def search_knowledge(query: str) -> str:
        if not knowledge_root.exists():
            return "Knowledge base is empty."
        query_lower = query.lower()
        results = []
        for md_file in sorted(knowledge_root.rglob("*.md")):
            if md_file.name == "_index.md":
                continue  # already in context
            try:
                post = frontmatter.load(str(md_file))
                content = post.content
                content_lower = content.lower()
                if query_lower not in content_lower:
                    continue
                idx = content_lower.find(query_lower)
                start = max(0, idx - _SNIPPET_BEFORE)
                end = min(len(content), idx + _SNIPPET_AFTER)
                snippet = content[start:end].strip()
                rel = md_file.relative_to(knowledge_root).as_posix()
                results.append(f"**{rel}**\n…{snippet}…")
            except Exception:
                pass
            if len(results) >= _SEARCH_RESULT_CAP:
                break
        if not results:
            return f"No knowledge files matched '{query}'."
        return "\n\n".join(results)

    declaration = gtypes.FunctionDeclaration(
        name="search_knowledge",
        description=(
            "Search all knowledge files for a term or topic. "
            "Returns matching file paths with context snippets. "
            "Use this when the knowledge index doesn't show the file you need."
        ),
        parameters={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The term or phrase to search for across all knowledge files",
                }
            },
            "required": ["query"],
        },
    )
    return declaration, search_knowledge


def build_read_inbox_tool(agent_dir: pathlib.Path):
    inbox_path = agent_dir / "INBOX.md"

    def read_inbox() -> str:
        if not inbox_path.exists():
            return "Inbox is empty."
        content = inbox_path.read_text(encoding="utf-8").strip()
        return content if content else "Inbox is empty."

    declaration = gtypes.FunctionDeclaration(
        name="read_inbox",
        description=(
            "Read the inbox of recently collected but not yet consolidated items. "
            "Use this when asked what the agent has been collecting or learning recently this week."
        ),
        parameters={"type": "object", "properties": {}},
    )
    return declaration, read_inbox


def build_list_knowledge_files_tool(agent_dir: pathlib.Path):
    knowledge_root = (agent_dir / "knowledge").resolve()

    def list_knowledge_files(subdirectory: str = "") -> str:
        if subdirectory:
            if ".." in subdirectory or subdirectory.startswith("/"):
                return "Error: invalid subdirectory"
            target = (knowledge_root / subdirectory).resolve()
            if not target.is_relative_to(knowledge_root):
                return "Error: path outside knowledge directory"
        else:
            target = knowledge_root
        if not knowledge_root.exists():
            return "Knowledge base is empty."
        if not target.exists():
            return f"Directory not found: {subdirectory}"
        files = sorted(target.rglob("*.md"))
        if not files:
            return "No knowledge files found."
        return "\n".join(f.relative_to(knowledge_root).as_posix() for f in files)

    declaration = gtypes.FunctionDeclaration(
        name="list_knowledge_files",
        description=(
            "List all knowledge files, optionally filtered to a subdirectory. "
            "Use this to discover what files exist beyond the top 20 shown in the index."
        ),
        parameters={
            "type": "object",
            "properties": {
                "subdirectory": {
                    "type": "string",
                    "description": "Optional subdirectory to list, e.g. 'concepts' or 'recent/2026-03'",
                }
            },
        },
    )
    return declaration, list_knowledge_files


# --- Registry ---

def build_tools(agent_dir: pathlib.Path) -> tuple[list, dict]:
    """
    Returns (declarations: list[FunctionDeclaration], handlers: dict[str, callable])
    for all tools available in an agent chat session.

    Add new tool builders here as the tool set grows.
    """
    tool_pairs = [
        build_read_knowledge_file_tool(agent_dir),
        build_search_knowledge_tool(agent_dir),
        build_read_inbox_tool(agent_dir),
        build_list_knowledge_files_tool(agent_dir),
    ]
    declarations = [decl for decl, _ in tool_pairs]
    handlers = {decl.name: fn for decl, fn in tool_pairs}
    return declarations, handlers
