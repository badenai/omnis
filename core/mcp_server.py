import pathlib
import logging

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from core.query import QueryHandler

logger = logging.getLogger(__name__)


def build_mcp_server(agents: dict) -> FastMCP:
    """Build an MCP server exposing each agent as an ask_{id} tool."""
    # Disable DNS-rebinding protection so the SSE app works when mounted
    # inside the FastAPI process (which binds to 0.0.0.0, not localhost).
    mcp = FastMCP("omnis", transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False))

    @mcp.tool()
    def list_agents() -> list[dict]:
        """List all available knowledge agents with their descriptions."""
        result = []
        for agent_id, agent in agents.items():
            soul_lines = agent.get("soul", "").strip().splitlines()
            description = soul_lines[0] if soul_lines else "No description."
            result.append({
                "id": agent_id,
                "description": description,
            })
        return result

    for agent_id, agent in agents.items():
        soul = agent.get("soul", "")
        agent_dir = agent["dir"]
        provider = agent.get("provider")
        soul_lines = soul.strip().splitlines()
        tool_description = soul_lines[0] if soul_lines else f"Ask the {agent_id} expert."

        def _make_ask_tool(aid: str, adir: pathlib.Path, s: str, p):
            @mcp.tool(name=f"ask_{aid}", description=tool_description)
            def ask_agent(query: str) -> str:
                """Ask this knowledge agent a question and get a full response."""
                qh = QueryHandler(agent_dir=adir, soul=s)
                tier = qh.select_tier(query)
                context, _ = qh.build_context(tier=tier)
                system_prompt = qh.build_system_prompt(context)
                tokens = list(p.stream_query(system_prompt, query, []))
                return "".join(tokens)
            return ask_agent

        _make_ask_tool(agent_id, agent_dir, soul, provider)

    return mcp


if __name__ == "__main__":
    import os
    from core.agent_loader import load_agent
    from core.constants import DATA_DIR

    logging.basicConfig(level=logging.INFO)

    AGENTS_DIR = DATA_DIR / "agents"
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
    loaded: dict = {}

    if AGENTS_DIR.exists():
        for agent_dir in sorted(AGENTS_DIR.iterdir()):
            if not agent_dir.is_dir() or not (agent_dir / "config.yaml").exists():
                continue
            try:
                loaded[agent_dir.name] = load_agent(agent_dir, gemini_api_key=gemini_api_key)
                logger.info(f"Loaded agent: {agent_dir.name}")
            except Exception as e:
                logger.error(f"Failed to load {agent_dir.name}: {e}")

    server = build_mcp_server(loaded)
    server.run()
