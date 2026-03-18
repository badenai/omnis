import pathlib
import pytest
import frontmatter


def _write_knowledge_file(path: pathlib.Path, content: str, **meta):
    post = frontmatter.Post(content, **meta)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(frontmatter.dumps(post), encoding="utf-8")


# ---------------------------------------------------------------------------
# search_knowledge
# ---------------------------------------------------------------------------

def test_search_knowledge_finds_match(tmp_path):
    from core.agent_tools import build_search_knowledge_tool
    _write_knowledge_file(tmp_path / "knowledge/concepts/topic.md", "RSI divergence is useful.")
    _, fn = build_search_knowledge_tool(tmp_path)
    result = fn("RSI divergence")
    assert "RSI divergence" in result
    assert "concepts/topic.md" in result


def test_search_knowledge_no_match(tmp_path):
    from core.agent_tools import build_search_knowledge_tool
    _write_knowledge_file(tmp_path / "knowledge/concepts/topic.md", "Something unrelated.")
    _, fn = build_search_knowledge_tool(tmp_path)
    result = fn("XYZ_NOT_PRESENT")
    assert "No knowledge files matched" in result


def test_search_knowledge_skips_index(tmp_path):
    from core.agent_tools import build_search_knowledge_tool
    # _index.md contains the query but should be skipped
    (tmp_path / "knowledge").mkdir(parents=True)
    (tmp_path / "knowledge/_index.md").write_text("hidden term", encoding="utf-8")
    _, fn = build_search_knowledge_tool(tmp_path)
    result = fn("hidden term")
    assert "No knowledge files matched" in result


def test_search_knowledge_empty_base(tmp_path):
    from core.agent_tools import build_search_knowledge_tool
    _, fn = build_search_knowledge_tool(tmp_path)
    result = fn("anything")
    assert "empty" in result.lower()


def test_search_knowledge_caps_results(tmp_path):
    from core.agent_tools import build_search_knowledge_tool
    concepts = tmp_path / "knowledge" / "concepts"
    concepts.mkdir(parents=True)
    for i in range(15):
        (concepts / f"file{i}.md").write_text(f"needle content {i}", encoding="utf-8")
    _, fn = build_search_knowledge_tool(tmp_path)
    result = fn("needle")
    # Cap is 10 — count occurrences of "**" opening markers
    assert result.count("**") <= 20  # 10 results × 2 asterisks per bold


# ---------------------------------------------------------------------------
# read_inbox
# ---------------------------------------------------------------------------

def test_read_inbox_returns_content(tmp_path):
    from core.agent_tools import build_read_inbox_tool
    (tmp_path / "INBOX.md").write_text("## Entry 1\nSome insight.", encoding="utf-8")
    _, fn = build_read_inbox_tool(tmp_path)
    result = fn()
    assert "Some insight." in result


def test_read_inbox_missing_file(tmp_path):
    from core.agent_tools import build_read_inbox_tool
    _, fn = build_read_inbox_tool(tmp_path)
    result = fn()
    assert "empty" in result.lower()


def test_read_inbox_empty_file(tmp_path):
    from core.agent_tools import build_read_inbox_tool
    (tmp_path / "INBOX.md").write_text("", encoding="utf-8")
    _, fn = build_read_inbox_tool(tmp_path)
    result = fn()
    assert "empty" in result.lower()


# ---------------------------------------------------------------------------
# list_knowledge_files
# ---------------------------------------------------------------------------

def test_list_knowledge_files_all(tmp_path):
    from core.agent_tools import build_list_knowledge_files_tool
    _write_knowledge_file(tmp_path / "knowledge/concepts/a.md", "A")
    _write_knowledge_file(tmp_path / "knowledge/concepts/b.md", "B")
    _, fn = build_list_knowledge_files_tool(tmp_path)
    result = fn()
    assert "concepts/a.md" in result
    assert "concepts/b.md" in result


def test_list_knowledge_files_subdirectory(tmp_path):
    from core.agent_tools import build_list_knowledge_files_tool
    _write_knowledge_file(tmp_path / "knowledge/concepts/x.md", "X")
    _write_knowledge_file(tmp_path / "knowledge/recent/2026-03/y.md", "Y")
    _, fn = build_list_knowledge_files_tool(tmp_path)
    result = fn(subdirectory="concepts")
    assert "x.md" in result
    assert "y.md" not in result


def test_list_knowledge_files_rejects_traversal(tmp_path):
    from core.agent_tools import build_list_knowledge_files_tool
    _, fn = build_list_knowledge_files_tool(tmp_path)
    result = fn(subdirectory="../secrets")
    assert "Error" in result


def test_list_knowledge_files_empty_base(tmp_path):
    from core.agent_tools import build_list_knowledge_files_tool
    _, fn = build_list_knowledge_files_tool(tmp_path)
    result = fn()
    assert "empty" in result.lower()


# ---------------------------------------------------------------------------
# build_tools registry
# ---------------------------------------------------------------------------

def test_build_tools_returns_all_four(tmp_path):
    from core.agent_tools import build_tools
    decls, handlers = build_tools(tmp_path)
    names = {d.name for d in decls}
    assert names == {"read_knowledge_file", "search_knowledge", "read_inbox", "list_knowledge_files"}
    assert set(handlers.keys()) == names
