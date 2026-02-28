import pathlib
import pytest
from fastapi.testclient import TestClient
from core.models.types import AgentConfig


def _make_app(mocker, agent_dir, soul="Expert."):
    from api.app import create_app
    app = create_app()

    config = AgentConfig(
        agent_id="test-agent", model="gemini",
        analysis_mode="transcript_only", sources={},
        consolidation_schedule="0 3 * * 0", decay={"half_life_days": 365})
    provider = mocker.MagicMock()
    provider.stream_query.return_value = iter(["Hello", " world"])

    app.state.agents = {
        "test-agent": {
            "config": config,
            "dir": agent_dir,
            "soul": soul,
            "provider": provider,
        }
    }
    return app, provider


def test_query_endpoint_streams_tokens(tmp_path, mocker):
    app, provider = _make_app(mocker, tmp_path)
    (tmp_path / "memory.md").write_text("# Memory\nTest knowledge.", encoding="utf-8")

    client = TestClient(app, raise_server_exceptions=True)
    with client.stream(
        "POST", "/api/query/test-agent",
        json={"message": "Hi", "history": []}
    ) as r:
        assert r.status_code == 200
        assert "text/event-stream" in r.headers["content-type"]
        body = b"".join(r.iter_bytes()).decode()
        assert "Hello" in body
        assert "world" in body
        assert "[DONE]" in body


def test_query_endpoint_includes_sources(tmp_path, mocker):
    app, provider = _make_app(mocker, tmp_path)
    (tmp_path / "memory.md").write_text("# Memory\nKnowledge here.", encoding="utf-8")

    client = TestClient(app, raise_server_exceptions=True)
    with client.stream(
        "POST", "/api/query/test-agent",
        json={"message": "What do you know?", "history": []}
    ) as r:
        body = b"".join(r.iter_bytes()).decode()
        assert '"sources"' in body
        assert "memory.md" in body


def test_query_endpoint_404_for_unknown_agent(tmp_path, mocker):
    app, _ = _make_app(mocker, tmp_path)
    client = TestClient(app)
    r = client.post(
        "/api/query/no-such-agent",
        json={"message": "Hi", "history": []}
    )
    assert r.status_code == 404


def test_query_endpoint_calls_provider_with_system_prompt(tmp_path, mocker):
    app, provider = _make_app(mocker, tmp_path, soul="Focus on trading.")
    (tmp_path / "memory.md").write_text("# Memory\nTrading insights.", encoding="utf-8")

    client = TestClient(app, raise_server_exceptions=True)
    with client.stream(
        "POST", "/api/query/test-agent",
        json={"message": "What is support?", "history": []}
    ) as r:
        r.read()

    provider.stream_query.assert_called_once()
    call_args = provider.stream_query.call_args
    system_prompt = call_args[0][0]
    assert "Focus on trading." in system_prompt
    assert "Trading insights." in system_prompt
