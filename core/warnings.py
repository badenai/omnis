import pathlib
from datetime import datetime, timezone


def append_warnings(agent_dir: pathlib.Path, warnings: list[str]) -> None:
    """Append timestamped warning entries to {agent_dir}/warnings.md."""
    path = agent_dir / "warnings.md"
    existing = path.read_text(encoding="utf-8") if path.exists() else "# Agent Warnings\n"
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    new_block = f"\n## {ts}\n" + "\n".join(f"- {w}" for w in warnings) + "\n"
    path.write_text(existing + new_block, encoding="utf-8")
