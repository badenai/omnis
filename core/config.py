import pathlib
import yaml
from core.models.types import AgentConfig, SkillEvalConfig


def load_agent_config(config_path: pathlib.Path) -> AgentConfig:
    with open(config_path) as f:
        data = yaml.safe_load(f)
    return AgentConfig(
        agent_id=data["agent_id"],
        model=data["model"],
        analysis_mode=data.get("analysis_mode", "transcript_only"),
        sources=data.get("sources", []),
        consolidation_schedule=data.get("consolidation_schedule", "0 3 * * 0"),
        decay=data.get("decay", {"half_life_days": 365}),
        collection_model=data.get("collection_model", "gemini-3-flash-preview"),
        consolidation_model=data.get("consolidation_model", "gemini-3.1-pro-preview"),
        self_improving=data.get("self_improving", True),
        skill_eval=_parse_skill_eval_config(data.get("skill_eval", {})),
        paused=data.get("paused", False),
    )


def _parse_skill_eval_config(raw: dict) -> SkillEvalConfig:
    return SkillEvalConfig(
        prompts=raw.get("prompts", []),
        min_quality_threshold=raw.get("min_quality_threshold", 0.6),
        enabled=raw.get("enabled", True),
    )


def load_soul(agent_dir: pathlib.Path) -> str:
    soul_file = agent_dir / "SOUL.md"
    if soul_file.exists():
        return soul_file.read_text(encoding="utf-8")
    return ""


def save_agent_config(config_path: pathlib.Path, config: dict) -> None:
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w", encoding="utf-8") as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)


def save_soul(agent_dir: pathlib.Path, text: str) -> None:
    agent_dir.mkdir(parents=True, exist_ok=True)
    soul_file = agent_dir / "SOUL.md"
    soul_file.write_text(text, encoding="utf-8")


def save_soul_backup(agent_dir: pathlib.Path, soul: str) -> None:
    (agent_dir / "soul_backup.md").write_text(soul, encoding="utf-8")


def restore_soul_backup(agent_dir: pathlib.Path) -> str | None:
    backup = agent_dir / "soul_backup.md"
    if not backup.exists():
        return None
    return backup.read_text(encoding="utf-8")
