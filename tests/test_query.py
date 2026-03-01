import pathlib
import pytest


def test_select_tier_default():
    from core.query import QueryHandler
    qh = QueryHandler.__new__(QueryHandler)
    assert qh.select_tier("What do you know about price action?") == 1


def test_select_tier_recent_keywords():
    from core.query import QueryHandler
    qh = QueryHandler.__new__(QueryHandler)
    assert qh.select_tier("What are the latest trends this week?") == 2
    assert qh.select_tier("What happened recently in AI?") == 2


def test_build_context_tier1_returns_soul_and_digest(tmp_path):
    from core.query import QueryHandler
    soul = "I am an expert."
    (tmp_path / "digest.md").write_text("# Digest\nKey insight here.", encoding="utf-8")
    qh = QueryHandler(agent_dir=tmp_path, soul=soul)
    context, sources = qh.build_context(tier=1)
    assert "Key insight here." in context
    assert sources == ["digest.md"]


def test_build_context_tier1_falls_back_if_no_digest(tmp_path):
    from core.query import QueryHandler
    qh = QueryHandler(agent_dir=tmp_path, soul="Expert.")
    context, sources = qh.build_context(tier=1)
    assert context == ""
    assert sources == []


def test_build_context_tier2_includes_recent_files(tmp_path):
    from core.query import QueryHandler
    from datetime import datetime, timezone
    import frontmatter

    # Write digest.md
    (tmp_path / "digest.md").write_text("# Digest\nBase knowledge.", encoding="utf-8")

    # Write a recent knowledge file dated today
    recent_dir = tmp_path / "knowledge" / "recent" / datetime.now(timezone.utc).strftime("%Y-%m")
    recent_dir.mkdir(parents=True)
    today = datetime.now(timezone.utc).date().isoformat()
    post = frontmatter.Post("Recent insight about trends.", created=today, relevance_score=1.0)
    (recent_dir / "trend-news.md").write_text(frontmatter.dumps(post), encoding="utf-8")

    qh = QueryHandler(agent_dir=tmp_path, soul="Expert.")
    context, sources = qh.build_context(tier=2)
    assert "Recent insight about trends." in context
    assert any("trend-news.md" in s for s in sources)


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
