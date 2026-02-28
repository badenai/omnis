import asyncio
import pathlib


def test_mcp_server_module_imports():
    """MCP server module must import without errors."""
    import core.mcp_server  # noqa: F401


def test_list_agents_tool_exists():
    from core.mcp_server import build_mcp_server

    agents = {
        "test": {
            "config": type("C", (), {"agent_id": "test"})(),
            "dir": pathlib.Path("/tmp"),
            "soul": "I am an expert.",
            "provider": None,
        }
    }
    server = build_mcp_server(agents)
    tool_names = [t.name for t in asyncio.run(server.list_tools())]
    assert "list_agents" in tool_names
    assert "ask_test" in tool_names
