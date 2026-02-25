import pathlib
import logging
from core.inbox import InboxWriter
from core.knowledge import KnowledgeWriter
from core.skill_writer import SkillWriter
from core.state import AgentState
from core.models.types import AgentConfig

logger = logging.getLogger(__name__)


class ConsolidationPipeline:
    def __init__(self, agent_dir: pathlib.Path, config: AgentConfig, provider, soul: str):
        self._dir = agent_dir
        self._config = config
        self._provider = provider
        self._soul = soul

    def run(self) -> None:
        inbox = InboxWriter(self._dir)
        items = inbox.read_items()
        if not items:
            logger.info("Inbox empty, skipping consolidation.")
            return

        logger.info(f"Consolidating {len(items)} inbox items.")
        index_path = self._dir / "knowledge" / "_index.md"
        existing_index = index_path.read_text(encoding="utf-8") if index_path.exists() else ""

        result = self._provider.consolidate(items, existing_index, self._soul)

        kw = KnowledgeWriter(self._dir, self._config.decay.get("half_life_days", 365))
        for decision in result.decisions:
            if decision.inbox_index >= len(items):
                continue
            content = items[decision.inbox_index]
            if decision.action == "update_concept":
                kw.update_concept(decision.target, content, source_id="inbox")
            elif decision.action == "new_concept":
                kw.write_concept(decision.target, content)
            elif decision.action == "new_recent":
                kw.write_recent(decision.target, content, source_id="inbox")

        knowledge_files = kw.load_all_weighted()

        briefing = self._provider.generate_briefing(knowledge_files, self._soul, self._config.mode)
        (self._dir / "briefing.md").write_text(briefing, encoding="utf-8")

        skill_content = self._provider.generate_skill(
            briefing, self._soul, self._config.agent_id
        )
        sw = SkillWriter(self._dir)
        sw.write(skill_content, self._config.agent_id)

        from core.registry import Registry
        import pathlib
        reg = Registry(pathlib.Path.home() / ".cloracle" / "registry.json")
        reg.register(
            self._config.agent_id,
            self._dir / "SKILL.md",
            self._config.mode,
        )
        reg.save()

        self._update_index(knowledge_files)
        inbox.clear()

        state = AgentState(self._dir)
        state.update_last_consolidation()
        state.save()
        logger.info("Consolidation complete.")

    def _update_index(self, files: list[dict]) -> None:
        lines = ["# Knowledge Index\n"]
        for f in files[:20]:
            lines.append(f"- `{f['path']}` — weight: {f['effective_weight']:.3f}")
        index_path = self._dir / "knowledge" / "_index.md"
        index_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.write_text("\n".join(lines), encoding="utf-8")
