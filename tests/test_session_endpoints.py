import pathlib
import pytest
from fastapi.testclient import TestClient
from core.models.types import AgentConfig


def _make_app(tmp_path):
    from api.app import create_app
    app = create_app()
    config = AgentConfig(
        agent_id="test-agent", model="gemini",
        analysis_mode="transcript_only", sources={},
        consolidation_schedule="0 3 * * 0", decay={"half_life_days": 365},
    )
    app.state.agents = {
        "test-agent": {"config": config, "dir": tmp_path, "soul": "", "provider": None}
    }
    return app


def test_session_report_returns_content(tmp_path):
    (tmp_path / "last_session.md").write_text("# Session Report", encoding="utf-8")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/session-report")
    assert r.status_code == 200
    assert r.json()["content"] == "# Session Report"


def test_session_report_404_when_missing(tmp_path):
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/session-report")
    assert r.status_code == 404


def test_skill_diff_returns_old_and_new(tmp_path):
    (tmp_path / "SKILL.md").write_text("new skill", encoding="utf-8")
    (tmp_path / "SKILL.previous.md").write_text("old skill", encoding="utf-8")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/skill-diff")
    assert r.status_code == 200
    assert r.json()["old_content"] == "old skill"
    assert r.json()["new_content"] == "new skill"


def test_skill_diff_null_old_when_no_previous(tmp_path):
    (tmp_path / "SKILL.md").write_text("first skill", encoding="utf-8")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/skill-diff")
    assert r.status_code == 200
    assert r.json()["old_content"] is None
    assert r.json()["new_content"] == "first skill"


def test_skill_diff_404_when_no_skill(tmp_path):
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/skill-diff")
    assert r.status_code == 404


def test_digest_diff_returns_old_and_new(tmp_path):
    (tmp_path / "digest.md").write_text("new digest", encoding="utf-8")
    (tmp_path / "digest.previous.md").write_text("old digest", encoding="utf-8")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/digest-diff")
    assert r.status_code == 200
    assert r.json()["old_content"] == "old digest"
    assert r.json()["new_content"] == "new digest"


def test_digest_diff_404_when_no_digest(tmp_path):
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/digest-diff")
    assert r.status_code == 404


def test_digest_diff_null_old_when_no_previous(tmp_path):
    (tmp_path / "digest.md").write_text("first digest", encoding="utf-8")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/digest-diff")
    assert r.status_code == 200
    assert r.json()["old_content"] is None
    assert r.json()["new_content"] == "first digest"
