import pathlib


def test_build_context_returns_digest(tmp_path):
    from core.query import QueryHandler
    (tmp_path / "digest.md").write_text("# Digest\nKey insight here.", encoding="utf-8")
    qh = QueryHandler(agent_dir=tmp_path, soul="Expert.")
    context, sources = qh.build_context()
    assert "Key insight here." in context
    assert "digest.md" in sources


def test_build_context_includes_index(tmp_path):
    from core.query import QueryHandler
    (tmp_path / "digest.md").write_text("Digest content.", encoding="utf-8")
    knowledge_dir = tmp_path / "knowledge"
    knowledge_dir.mkdir()
    (knowledge_dir / "_index.md").write_text("# Index\ntopic.md — weight 0.9", encoding="utf-8")
    qh = QueryHandler(agent_dir=tmp_path, soul="Expert.")
    context, sources = qh.build_context()
    assert "topic.md" in context
    assert "knowledge/_index.md" in sources


def test_build_context_falls_back_if_no_files(tmp_path):
    from core.query import QueryHandler
    qh = QueryHandler(agent_dir=tmp_path, soul="Expert.")
    context, sources = qh.build_context()
    assert context == ""
    assert sources == []


def test_build_system_prompt_contains_soul(tmp_path):
    from core.query import QueryHandler
    qh = QueryHandler(agent_dir=tmp_path, soul="Focus on trading systems.")
    prompt = qh.build_system_prompt("Some knowledge here.")
    assert "Focus on trading systems." in prompt
    assert "Some knowledge here." in prompt


def test_build_system_prompt_empty_context(tmp_path):
    from core.query import QueryHandler
    qh = QueryHandler(agent_dir=tmp_path, soul="Expert.")
    prompt = qh.build_system_prompt("")
    assert "empty" in prompt.lower() or "collection" in prompt.lower()
