import pathlib
import logging

from core.constants import DATA_DIR
from core.knowledge import KnowledgeWriter
from core.registry import Registry
from core.skill_writer import SkillWriter
from core.state import AgentState
from core.models.types import AgentConfig

logger = logging.getLogger(__name__)


class MicroConsolidation:
    """Single-item immediate consolidation for reflect_immediately agents.

    Instead of batching items in the inbox and running a full consolidation
    on a schedule, this processes each collected item the moment it arrives.
    """

    def __init__(self, agent_dir: pathlib.Path, config: AgentConfig, provider, soul: str):
        self._dir = agent_dir
        self._config = config
        self._provider = provider
        self._soul = soul

    def run(self, item: str) -> None:
        agent_id = self._config.agent_id
        logger.info(f"[{agent_id}] Micro-consolidation triggered.")

        index_path = self._dir / "knowledge" / "_index.md"
        existing_index = index_path.read_text(encoding="utf-8") if index_path.exists() else ""

        result = self._provider.consolidate([item], existing_index, self._soul)

        kw = KnowledgeWriter(self._dir, self._config.decay.get("half_life_days", 365))
        for decision in result.decisions:
            if decision.action == "update_concept":
                kw.update_concept(decision.target, item, source_id="micro")
            elif decision.action == "new_concept":
                kw.write_concept(decision.target, item)
            elif decision.action == "new_recent":
                kw.write_recent(decision.target, item, source_id="micro")

        knowledge_files = kw.load_all_weighted()

        memory = self._provider.generate_briefing(knowledge_files, self._soul)
        (self._dir / "memory.md").write_text(memory, encoding="utf-8")

        skill_content = self._provider.generate_skill(memory, self._soul, agent_id)
        sw = SkillWriter(self._dir)
        sw.write(skill_content, agent_id)

        reg = Registry(DATA_DIR / "registry.json")
        reg.register(agent_id, self._dir / "SKILL.md", "")
        reg.save()

        self._update_index(knowledge_files)

        state = AgentState(self._dir)
        state.update_last_consolidation()
        state.save()

        logger.info(f"[{agent_id}] Micro-consolidation complete.")

    def _update_index(self, files: list[dict]) -> None:
        lines = ["# Knowledge Index\n"]
        for f in files[:20]:
            lines.append(f"- `{f['path']}` — weight: {f['effective_weight']:.3f}")
        index_path = self._dir / "knowledge" / "_index.md"
        index_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.write_text("\n".join(lines), encoding="utf-8")
