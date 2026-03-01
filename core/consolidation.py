import pathlib
import logging
from core.constants import DATA_DIR
from core.inbox import InboxWriter
from core.knowledge import KnowledgeWriter
from core.registry import Registry
from core.skill_writer import SkillWriter
from core.state import AgentState
from core.models.types import AgentConfig
from core import job_status

logger = logging.getLogger(__name__)


class ConsolidationPipeline:
    def __init__(self, agent_dir: pathlib.Path, config: AgentConfig, provider, soul: str):
        self._dir = agent_dir
        self._config = config
        self._provider = provider
        self._soul = soul

    def run(self) -> None:
        agent_id = self._config.agent_id
        task = "consolidation"
        job_status.start(agent_id, task, "Reading inbox...")

        try:
            inbox = InboxWriter(self._dir)
            items = inbox.read_items()
            if not items:
                logger.info("Inbox empty, skipping consolidation.")
                job_status.complete(agent_id, task)
                return

            logger.info(f"Consolidating {len(items)} inbox items.")
            index_path = self._dir / "knowledge" / "_index.md"
            existing_index = index_path.read_text(encoding="utf-8") if index_path.exists() else ""

            job_status.update_step(agent_id, task, f"Asking model to categorize {len(items)} inbox items...")
            result = self._provider.consolidate(items, existing_index, self._soul)

            job_status.update_step(agent_id, task, f"Writing {len(result.decisions)} knowledge files...")
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

            job_status.update_step(agent_id, task, "Generating digest.md...")
            digest = self._provider.generate_digest(knowledge_files, self._soul)
            (self._dir / "digest.md").write_text(digest, encoding="utf-8")

            job_status.update_step(agent_id, task, "Generating SKILL.md...")
            skill_content = self._provider.generate_skill(
                digest, self._soul, self._config.agent_id
            )
            sw = SkillWriter(self._dir)
            sw.write(skill_content, self._config.agent_id)

            reg = Registry(DATA_DIR / "registry.json")
            reg.register(
                self._config.agent_id,
                self._dir / "SKILL.md",
                "",
            )
            reg.save()

            self._update_index(knowledge_files)
            inbox.clear()

            state = AgentState(self._dir)
            state.update_last_consolidation()
            state.save()
            logger.info("Consolidation complete.")
            self._call_thesis_validation_safely()
            job_status.complete(agent_id, task)

        except Exception as e:
            logger.error(f"Consolidation failed: {e}")
            job_status.fail(agent_id, task, str(e))
            raise

    def run_reevaluation(self) -> None:
        agent_id = self._config.agent_id
        task = "reevaluation"
        job_status.start(agent_id, task, "Loading knowledge files...")

        try:
            kw = KnowledgeWriter(self._dir, self._config.decay.get("half_life_days", 365))
            files = kw.load_all_weighted()
            if not files:
                logger.info("No knowledge files found, skipping reevaluation.")
                job_status.complete(agent_id, task)
                return

            job_status.update_step(agent_id, task, f"Re-scoring {len(files)} knowledge files against SOUL...")
            scores = self._provider.reevaluate_knowledge(files, self._soul)

            job_status.update_step(agent_id, task, "Updating knowledge file scores...")
            for path, score in scores.items():
                kw.update_relevance_score(path, score)

            knowledge_files = kw.load_all_weighted()

            job_status.update_step(agent_id, task, "Generating digest.md...")
            digest = self._provider.generate_digest(knowledge_files, self._soul)
            (self._dir / "digest.md").write_text(digest, encoding="utf-8")

            job_status.update_step(agent_id, task, "Generating SKILL.md...")
            skill_content = self._provider.generate_skill(digest, self._soul, self._config.agent_id)
            sw = SkillWriter(self._dir)
            sw.write(skill_content, self._config.agent_id)

            reg = Registry(DATA_DIR / "registry.json")
            reg.register(self._config.agent_id, self._dir / "SKILL.md", "")
            reg.save()

            self._update_index(knowledge_files)

            state = AgentState(self._dir)
            state.update_last_consolidation()
            state.save()
            logger.info("Reevaluation complete.")
            job_status.complete(agent_id, task)

        except Exception as e:
            logger.error(f"Reevaluation failed: {e}")
            job_status.fail(agent_id, task, str(e))
            raise

    def run_thesis_validation(self) -> None:
        """Search for counter-evidence against current knowledge. Appends results to digest.md."""
        agent_id = self._config.agent_id
        task = "thesis-validation"
        job_status.start(agent_id, task, "Loading knowledge for thesis validation...")

        try:
            kw = KnowledgeWriter(self._dir, self._config.decay.get("half_life_days", 365))
            files = kw.load_all_weighted()
            if not files:
                job_status.complete(agent_id, task)
                return

            top_files = files[:15]
            job_status.update_step(agent_id, task, f"Searching for counter-evidence on {len(top_files)} files...")
            result = self._provider.validate_thesis(top_files, self._soul)

            digest_path = self._dir / "digest.md"
            existing = digest_path.read_text(encoding="utf-8") if digest_path.exists() else ""
            digest_path.write_text(existing + "\n\n" + self._format_validation_section(result), encoding="utf-8")

            logger.info(f"[{agent_id}] Thesis validation: {len(result.flagged_files)} flag(s)")
            job_status.complete(agent_id, task)

        except Exception as e:
            logger.error(f"[{agent_id}] Thesis validation failed: {e}")
            job_status.fail(agent_id, task, str(e))
            raise

    def _format_validation_section(self, result) -> str:
        from datetime import datetime, timezone
        lines = [
            "---",
            f"## Thesis Validation — {datetime.now(timezone.utc).date().isoformat()}",
            "",
            result.validation_summary,
            "",
        ]
        if result.flagged_files:
            lines.append("### Flagged for Review")
            for flag in result.flagged_files:
                sev = flag.get("severity", "low").upper()
                lines.append(f"- [{sev}] `{flag['path']}` — {flag['concern']}")
        return "\n".join(lines)

    def _call_thesis_validation_safely(self) -> None:
        """Run thesis validation; swallow errors so consolidation succeeds."""
        try:
            self.run_thesis_validation()
        except Exception:
            logger.warning(f"[{self._config.agent_id}] Thesis validation failed; consolidation continues.")

    def _update_index(self, files: list[dict]) -> None:
        lines = ["# Knowledge Index\n"]
        for f in files[:20]:
            lines.append(f"- `{f['path']}` — weight: {f['effective_weight']:.3f}")
        index_path = self._dir / "knowledge" / "_index.md"
        index_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.write_text("\n".join(lines), encoding="utf-8")
