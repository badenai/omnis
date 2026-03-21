# tests/test_github_publisher.py
import pathlib
import pytest
from core.github_publisher import GitHubPublisher

def _make_publisher():
    return GitHubPublisher(token="tok", repo="owner/repo")

def test_extract_description_returns_first_non_heading_line(tmp_path):
    (tmp_path / "SOUL.md").write_text("# Agent Title\n\nFocus on trading systems.\n")
    pub = _make_publisher()
    assert pub._extract_description(tmp_path) == "Focus on trading systems."

def test_extract_description_skips_blank_lines(tmp_path):
    (tmp_path / "SOUL.md").write_text("\n\n# Heading\n\nActual content here.\n")
    pub = _make_publisher()
    assert pub._extract_description(tmp_path) == "Actual content here."

def test_extract_description_strips_bold_markers(tmp_path):
    (tmp_path / "SOUL.md").write_text("**Focus on** trading.\n")
    pub = _make_publisher()
    assert pub._extract_description(tmp_path) == "Focus on trading."

def test_extract_description_truncates_to_200(tmp_path):
    (tmp_path / "SOUL.md").write_text("x" * 300 + "\n")
    pub = _make_publisher()
    assert len(pub._extract_description(tmp_path)) == 200

def test_extract_description_missing_soul_returns_empty(tmp_path):
    pub = _make_publisher()
    assert pub._extract_description(tmp_path) == ""

def test_extract_description_only_headings_returns_empty(tmp_path):
    (tmp_path / "SOUL.md").write_text("# Title\n## Subtitle\n")
    pub = _make_publisher()
    assert pub._extract_description(tmp_path) == ""

def test_extract_description_strips_italic_markers(tmp_path):
    (tmp_path / "SOUL.md").write_text("*Focus on* trading.\n")
    pub = _make_publisher()
    assert pub._extract_description(tmp_path) == "Focus on trading."

def test_extract_description_strips_underscore_italic(tmp_path):
    (tmp_path / "SOUL.md").write_text("_Focus on_ trading.\n")
    pub = _make_publisher()
    assert pub._extract_description(tmp_path) == "Focus on trading."


import base64
import json
from unittest.mock import MagicMock, patch


def _setup_agent_dir(tmp_path, agent_id):
    """Create a minimal agent directory for testing."""
    agent_dir = tmp_path / agent_id
    agent_dir.mkdir()
    (agent_dir / "SOUL.md").write_text("# My Agent\nFocus here.\n")
    (agent_dir / "digest.md").write_text("# Digest")   # ← agent_dir root, not references/
    skills = agent_dir / "skills" / "main-topic"
    skills.mkdir(parents=True)
    (skills / "SKILL.md").write_text("# Skill")
    agents = agent_dir / "agents"
    agents.mkdir()
    (agents / f"{agent_id}.md").write_text("# Agent def")
    hooks = agent_dir / "hooks"
    hooks.mkdir()
    (hooks / "hooks.json").write_text('{"SessionStart":[]}')
    (hooks / "inject-digest.js").write_text("// js")
    return agent_dir


def test_collect_files_includes_all_required_paths(tmp_path):
    agent_id = "my-agent"
    agent_dir = _setup_agent_dir(tmp_path, agent_id)
    pub = _make_publisher()
    files = pub._collect_files(agent_id, agent_dir)
    assert f"agents/{agent_id}/skills/main-topic/SKILL.md" in files
    assert f"agents/{agent_id}/agents/{agent_id}.md" in files
    assert f"agents/{agent_id}/references/digest.md" in files
    assert f"agents/{agent_id}/hooks/hooks.json" in files
    assert f"agents/{agent_id}/hooks/inject-digest.js" in files
    assert f"agents/{agent_id}/plugin.json" in files


def test_collect_files_excludes_mcp_json(tmp_path):
    agent_id = "my-agent"
    agent_dir = _setup_agent_dir(tmp_path, agent_id)
    (agent_dir / ".mcp.json").write_text("{}")
    pub = _make_publisher()
    files = pub._collect_files(agent_id, agent_dir)
    assert not any(".mcp.json" in k for k in files)


def test_build_plugin_json_has_no_mcp_field(tmp_path):
    agent_id = "my-agent"
    agent_dir = _setup_agent_dir(tmp_path, agent_id)
    pub = _make_publisher()
    raw = pub._build_plugin_json(agent_id, agent_dir)
    data = json.loads(raw)
    assert "mcp" not in data
    assert data["name"] == f"omnis-{agent_id}"


def test_upsert_file_creates_new_file(tmp_path):
    """When file doesn't exist, PUT without SHA."""
    pub = _make_publisher()
    mock_response_get = MagicMock()
    mock_response_get.status_code = 404
    mock_response_put = MagicMock()
    mock_response_put.raise_for_status = MagicMock()

    with patch.object(pub._client, "get", return_value=mock_response_get), \
         patch.object(pub._client, "put", return_value=mock_response_put) as mock_put:
        pub._upsert_file("agents/x/SKILL.md", "content")

    call_body = mock_put.call_args[1]["json"]
    assert "sha" not in call_body
    assert base64.b64decode(call_body["content"]).decode() == "content"


def test_upsert_file_updates_existing_file_with_sha(tmp_path):
    """When file exists, PUT includes the current SHA."""
    pub = _make_publisher()
    mock_response_get = MagicMock()
    mock_response_get.status_code = 200
    mock_response_get.json.return_value = {"sha": "abc123"}
    mock_response_put = MagicMock()
    mock_response_put.raise_for_status = MagicMock()

    with patch.object(pub._client, "get", return_value=mock_response_get), \
         patch.object(pub._client, "put", return_value=mock_response_put) as mock_put:
        pub._upsert_file("agents/x/SKILL.md", "new content")

    call_body = mock_put.call_args[1]["json"]
    assert call_body["sha"] == "abc123"


def test_regenerate_marketplace_creates_new_when_missing(tmp_path):
    pub = _make_publisher()
    mock_get = MagicMock()
    mock_get.status_code = 404

    with patch.object(pub._client, "get", return_value=mock_get), \
         patch.object(pub, "_upsert_file") as mock_upsert:
        pub._regenerate_marketplace("my-agent", "2", "Focus here.")

    assert mock_upsert.called
    written = json.loads(mock_upsert.call_args[0][1])
    plugin = next(p for p in written["plugins"] if p["name"] == "my-agent")
    assert plugin["version"] == "2"
    assert plugin["description"] == "Focus here."


def test_regenerate_marketplace_upserts_existing_entry(tmp_path):
    pub = _make_publisher()
    existing = {
        "name": "omnis",
        "plugins": [
            {"name": "other-agent", "version": "1", "description": "other"},
            {"name": "my-agent", "version": "1", "description": "old"},
        ]
    }
    encoded = base64.b64encode(json.dumps(existing).encode()).decode()

    mock_get = MagicMock()
    mock_get.status_code = 200
    mock_get.json.return_value = {"sha": "oldsha", "content": encoded}

    with patch.object(pub._client, "get", return_value=mock_get), \
         patch.object(pub, "_upsert_file") as mock_upsert:
        pub._regenerate_marketplace("my-agent", "3", "new desc")

    written = json.loads(mock_upsert.call_args[0][1])
    # other-agent preserved, my-agent updated
    assert len(written["plugins"]) == 2
    my = next(p for p in written["plugins"] if p["name"] == "my-agent")
    assert my["version"] == "3"
    assert my["description"] == "new desc"


def test_publish_calls_upsert_for_all_collected_files(tmp_path):
    agent_id = "my-agent"
    agent_dir = _setup_agent_dir(tmp_path, agent_id)
    pub = _make_publisher()

    with patch.object(pub, "_upsert_file") as mock_upsert, \
         patch.object(pub, "_regenerate_marketplace"):
        pub.publish(agent_id, agent_dir, version="5")

    paths_uploaded = [call[0][0] for call in mock_upsert.call_args_list]
    assert any("SKILL.md" in p for p in paths_uploaded)
    assert any("plugin.json" in p for p in paths_uploaded)
    assert not any(".mcp.json" in p for p in paths_uploaded)


def test_publish_calls_regenerate_marketplace(tmp_path):
    agent_id = "my-agent"
    agent_dir = _setup_agent_dir(tmp_path, agent_id)
    pub = _make_publisher()

    with patch.object(pub, "_upsert_file"), \
         patch.object(pub, "_regenerate_marketplace") as mock_regen:
        pub.publish(agent_id, agent_dir, version="5")

    mock_regen.assert_called_once_with("my-agent", "5", pub._extract_description(agent_dir))
