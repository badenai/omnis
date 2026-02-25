import os
import pathlib
import logging
from dotenv import load_dotenv
from core.agent_loader import load_agent
from core.scheduler import build_scheduler

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

WORKSPACE = pathlib.Path.home() / ".cloracle"
AGENTS_DIR = WORKSPACE / "agents"


def main():
    gemini_api_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable not set.")

    AGENTS_DIR.mkdir(parents=True, exist_ok=True)

    agents = []
    for agent_dir in sorted(AGENTS_DIR.iterdir()):
        if not agent_dir.is_dir():
            continue
        if not (agent_dir / "config.yaml").exists():
            continue
        try:
            logger.info(f"Loading agent: {agent_dir.name}")
            agents.append(load_agent(agent_dir, gemini_api_key=gemini_api_key))
        except Exception as e:
            logger.error(f"Failed to load agent {agent_dir.name}: {e}")

    if not agents:
        logger.warning(
            f"No agents found in {AGENTS_DIR}. "
            "Create an agent directory with SOUL.md and config.yaml."
        )
        return

    logger.info(f"Loaded {len(agents)} agent(s). Starting scheduler. Press Ctrl+C to stop.")
    scheduler = build_scheduler(agents)
    try:
        scheduler.start()
    except KeyboardInterrupt:
        logger.info("Shutting down cloracle. Goodbye.")
        scheduler.shutdown(wait=False)


if __name__ == "__main__":
    main()
