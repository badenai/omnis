import pathlib
import yaml
from core.models.types import AgentConfig


def load_agent_config(config_path: pathlib.Path) -> AgentConfig:
    with open(config_path) as f:
        data = yaml.safe_load(f)
    return AgentConfig(
        agent_id=data["agent_id"],
        mode=data["mode"],
        model=data["model"],
        analysis_mode=data.get("analysis_mode", "transcript_only"),
        sources=data.get("sources", {}),
        consolidation_schedule=data.get("consolidation_schedule", "0 3 * * 0"),
        decay=data.get("decay", {"half_life_days": 365}),
    )


def load_soul(agent_dir: pathlib.Path) -> str:
    soul_file = agent_dir / "SOUL.md"
    if soul_file.exists():
        return soul_file.read_text(encoding="utf-8")
    return ""
