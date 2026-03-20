import difflib
import pathlib
import logging
from core.constants import DATA_DIR
from core.inbox import InboxWriter
from core.knowledge import KnowledgeWriter
from core.registry import Registry
from core.skill_writer import SkillWriter, PluginWriter
from core.skill_quality import SkillQualityStore
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
        job_status.set_current(agent_id, task)

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
            job_status.log(agent_id, task, f"Calling Gemini: categorizing {len(items)} inbox items…")
            result = self._provider.consolidate(items, existing_index, self._soul)

            job_status.update_step(agent_id, task, f"Writing {len(result.decisions)} knowledge files...")
            kw = KnowledgeWriter(self._dir, self._config.decay.get("half_life_days", 365))
            for decision in result.decisions:
                if decision.inbox_index >= len(items):
                    continue
                content = items[decision.inbox_index]
                score = decision.relevance_score
                if decision.action == "update_concept":
                    kw.update_concept(decision.target, content, source_id="inbox", relevance_score=score)
                    job_status.log(agent_id, task, f"update_concept: {decision.target} (score={score:.2f})")
                elif decision.action == "new_concept":
                    kw.write_concept(decision.target, content, relevance_score=score)
                    job_status.log(agent_id, task, f"new_concept: {decision.target} (score={score:.2f})")
                elif decision.action == "new_recent":
                    kw.write_recent(decision.target, content, source_id="inbox", relevance_score=score)
                    job_status.log(agent_id, task, f"new_recent: {decision.target} (score={score:.2f})")

            knowledge_files = kw.load_all_weighted()

            job_status.update_step(agent_id, task, "Generating digest.md...")
            digest = self._provider.generate_digest(knowledge_files, self._soul)
            digest_path = self._dir / "digest.md"
            previous_digest = digest_path.read_text(encoding="utf-8") if digest_path.exists() else None
            digest_path.write_text(digest, encoding="utf-8")
            if previous_digest is None:
                digest_changed = True
            elif previous_digest == digest:
                digest_changed = False
            else:
                digest_changed = True
                (self._dir / "digest.previous.md").write_text(previous_digest, encoding="utf-8")
                diff = difflib.unified_diff(
                    previous_digest.splitlines(keepends=True),
                    digest.splitlines(keepends=True),
                    fromfile="digest.previous.md",
                    tofile="digest.md",
                )
                (self._dir / "digest.diff").write_text("".join(diff), encoding="utf-8")
            job_status.log(agent_id, task, f"digest.md written ({len(digest):,} chars)")

            job_status.update_step(agent_id, task, "Generating plugin skills...")
            from core.skill_regression_analyzer import read_learnings
            from core.constants import APP_NAME
            learnings = read_learnings(self._dir)
            if learnings:
                job_status.log(agent_id, task, "Injecting regression learnings into skill generation…")
            _skills_dir = (
                pathlib.Path.home() / ".claude" / "plugins" / "cache"
                / APP_NAME / self._config.agent_id / "1.0.0" / "skills"
            )
            existing_clusters = (
                [d.name for d in _skills_dir.iterdir() if d.is_dir()]
                if _skills_dir.exists() else []
            )
            plugin_output = self._provider.generate_plugin_skills(
                digest, self._soul, self._config.agent_id,
                learnings=learnings, existing_clusters=existing_clusters or None,
            )
            pw = PluginWriter(self._dir)
            skill_changed = pw.write(plugin_output)
            primary_skill_content = plugin_output.skills[0].content if plugin_output.skills else ""
            job_status.log(
                agent_id, task,
                f"plugin written ({len(plugin_output.skills)} cluster skill(s))"
            )
            alert = self._run_skill_eval_safely(primary_skill_content)
            if alert:
                self._run_skill_rollback_safely()
            self._run_structure_audit_safely()

            reg = Registry(DATA_DIR / "registry.json")
            reg.register(self._config.agent_id, self._dir / "SKILL.md")
            reg.save()

            self._update_index(knowledge_files)

            job_status.update_step(agent_id, task, "Pruning low-weight knowledge files...")
            pruned = kw.prune_low_weight(threshold=0.1)
            if pruned:
                self._write_pruning_log(pruned)
                for p in pruned:
                    job_status.log(agent_id, task, f"pruned: {p}")

            job_status.update_step(agent_id, task, "Generating SOUL evolution suggestions...")
            try:
                job_status.log(agent_id, task, "Calling Gemini: generating soul evolution suggestions…")
                suggestions = self._provider.suggest_soul_refinements(self._soul, knowledge_files[:15])
                (self._dir / "soul_suggestions.md").write_text(suggestions, encoding="utf-8")
                job_status.log(agent_id, task, "soul_suggestions.md written")
            except Exception as e:
                logger.warning(f"[{agent_id}] Soul suggestions failed (non-fatal): {e}")

            if self._config.self_improving and self._config.skill_eval.enabled and self._config.skill_eval.prompts:
                self._run_soul_autopilot(digest, learnings)

            try:
                from core.session_report import write_session_report
                write_session_report(
                    agent_dir=self._dir,
                    inbox_items=items,
                    result=result,
                    knowledge_files_after=knowledge_files,
                    pruned_files=pruned,
                    skill_changed=skill_changed,
                    digest_changed=digest_changed,
                )
                job_status.log(agent_id, task, "last_session.md written")
            except Exception as e:
                logger.warning(f"[{agent_id}] Session report failed (non-fatal): {e}")

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
        job_status.set_current(agent_id, task)

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

            job_status.update_step(agent_id, task, "Generating plugin skills...")
            from core.skill_regression_analyzer import read_learnings
            learnings = read_learnings(self._dir)
            _skills_dir = self._dir / "skills"
            existing_clusters = (
                [d.name for d in _skills_dir.iterdir() if d.is_dir()]
                if _skills_dir.exists() else []
            )
            plugin_output = self._provider.generate_plugin_skills(
                digest, self._soul, self._config.agent_id,
                learnings=learnings, existing_clusters=existing_clusters or None,
            )
            pw = PluginWriter(self._dir)
            pw.write(plugin_output)
            primary_skill_content = plugin_output.skills[0].content if plugin_output.skills else ""
            self._run_skill_eval_safely(primary_skill_content)
            self._run_structure_audit_safely()

            reg = Registry(DATA_DIR / "registry.json")
            reg.register(self._config.agent_id, self._dir / "SKILL.md")
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

    def _run_skill_eval_safely(self, skill_content: str) -> bool:
        """Run SKILL.md quality evaluation; swallow errors so consolidation succeeds.

        Returns True if a quality alert fired (score below threshold or >20% drop),
        False otherwise (including on error).
        """
        agent_id = self._config.agent_id
        task = job_status.get_current()[1] if job_status.get_current() else "consolidation"
        eval_cfg = self._config.skill_eval
        if not (eval_cfg.enabled and eval_cfg.prompts):
            return False
        try:
            job_status.update_step(agent_id, task, "Evaluating SKILL.md quality...")
            result = self._provider.evaluate_skill(skill_content, eval_cfg.prompts, self._soul)
            store = SkillQualityStore(self._dir)
            store.append(result)
            alert = store.is_alert(eval_cfg.min_quality_threshold)
            job_status.log(
                agent_id, task,
                f"skill quality score: {result.score:.3f}"
                + (" ⚠ ALERT" if alert else "")
            )
            return alert
        except Exception as e:
            logger.warning(f"[{agent_id}] Skill quality check failed (non-fatal): {e}")
            return False

    def _run_structure_audit_safely(self) -> None:
        """Run SKILL.md structure audit after consolidation; swallow errors."""
        from core.description_optimizer import run_structure_audit
        agent_id = self._config.agent_id
        task = job_status.get_current()[1] if job_status.get_current() else "consolidation"
        skill_path = self._dir / "SKILL.md"
        if not skill_path.exists():
            return
        try:
            job_status.update_step(agent_id, task, "Auditing SKILL.md structure…")
            run_structure_audit(
                agent_dir=self._dir,
                agent_id=agent_id,
                skill_path=skill_path,
                provider=self._provider,
                job_log_fn=job_status.log,
            )
        except Exception as e:
            logger.warning(f"[{agent_id}] Structure audit failed (non-fatal): {e}")

    def _run_skill_rollback_safely(self) -> None:
        """Revert SKILL.md to its previous version on quality regression, then analyze root cause."""
        agent_id = self._config.agent_id
        task = job_status.get_current()[1] if job_status.get_current() else "consolidation"
        try:
            sw = SkillWriter(self._dir)
            reverted = sw.revert_to_previous(agent_id)
            if not reverted:
                logger.warning(f"[{agent_id}] Skill rollback skipped: no previous version found")
                return
            store = SkillQualityStore(self._dir)
            hist = store.history()
            score_after = hist[0]["score"] if hist else None       # bad score (just appended)
            score_before = hist[1]["score"] if len(hist) >= 2 else None  # previous good
            store.mark_rollback()
            job_status.log(agent_id, task, "⚠ SKILL.md auto-rolled back: quality score below threshold")
            from core.skill_regression_analyzer import analyze_regression, save_learnings
            analysis = analyze_regression(self._dir, self._provider)
            if analysis:
                save_learnings(self._dir, analysis, agent_id, score_before=score_before, score_after=score_after)
                job_status.log(agent_id, task, "regression analysis saved to skill_learnings.md")
        except Exception as e:
            logger.warning(f"[{agent_id}] Skill rollback failed (non-fatal): {e}")

    def _run_soul_autopilot(self, digest: str, learnings: str | None) -> None:
        """Test each soul suggestion independently; accumulate only the ones that pass.

        Each suggestion is integrated, evaluated, and kept or discarded on its own merit.
        The rolling baseline updates with each kept suggestion, so later suggestions are
        measured against the already-improved soul — matching autoresearch's one-at-a-time loop.

        Clears soul_suggestions.md after the full pass either way.
        """
        import re
        agent_id = self._config.agent_id
        task = job_status.get_current()[1] if job_status.get_current() else "consolidation"
        eval_cfg = self._config.skill_eval

        suggestions_path = self._dir / "soul_suggestions.md"
        if not suggestions_path.exists():
            return
        suggestions_text = suggestions_path.read_text("utf-8").strip()
        if not suggestions_text:
            return

        store = SkillQualityStore(self._dir)
        baseline_score = store.latest_score()
        if baseline_score is None:
            logger.info(f"[{agent_id}] Soul autopilot skipped: no baseline skill quality score")
            return

        # Parse into individual suggestions (## sections); fall back to whole text as one
        individual = [
            s.strip() for s in re.split(r'(?=^## )', suggestions_text, flags=re.MULTILINE)
            if s.strip().startswith("## ")
        ]
        if not individual:
            individual = [suggestions_text]

        try:
            from core.soul_experiment_log import append as log_experiment

            _TOLERANCE = 0.02
            current_soul = self._soul
            current_baseline = baseline_score
            last_kept_skill: str | None = None
            last_kept_result = None
            kept, discarded = 0, 0

            job_status.update_step(agent_id, task, f"Soul autopilot: testing {len(individual)} suggestion(s) one by one…")

            for i, suggestion in enumerate(individual):
                label = f"[{i + 1}/{len(individual)}]"
                job_status.log(agent_id, task, f"Soul autopilot {label}: integrating suggestion…")

                candidate_soul = self._provider.integrate_soul_suggestions(current_soul, [suggestion])

                job_status.log(agent_id, task, f"Soul autopilot {label}: generating candidate SKILL.md…")
                candidate_skill = self._provider.generate_skill(
                    digest, candidate_soul, agent_id, learnings=learnings
                )

                job_status.log(agent_id, task, f"Soul autopilot {label}: evaluating…")
                candidate_result = self._provider.evaluate_skill(
                    candidate_skill, eval_cfg.prompts, candidate_soul
                )
                candidate_score = candidate_result.score

                action = "keep" if candidate_score >= current_baseline - _TOLERANCE else "discard"

                log_experiment(
                    agent_dir=self._dir,
                    soul_before=current_soul,
                    soul_after=candidate_soul,
                    skill_score_before=current_baseline,
                    skill_score_after=candidate_score,
                    action=action,
                    suggestions_count=1,
                )

                if action == "keep":
                    current_soul = candidate_soul
                    current_baseline = candidate_score
                    last_kept_skill = candidate_skill
                    last_kept_result = candidate_result
                    kept += 1
                    job_status.log(
                        agent_id, task,
                        f"Soul autopilot {label}: ✓ KEPT (score {current_baseline:.3f} → {candidate_score:.3f})"
                    )
                else:
                    discarded += 1
                    job_status.log(
                        agent_id, task,
                        f"Soul autopilot {label}: ✗ DISCARDED (score {current_baseline:.3f} → {candidate_score:.3f})"
                    )

            if kept > 0 and last_kept_skill is not None:
                from core.config import save_soul, save_soul_backup
                save_soul_backup(self._dir, self._soul)
                save_soul(self._dir, current_soul)
                self._soul = current_soul
                sw = SkillWriter(self._dir)
                sw.write(last_kept_skill, agent_id)
                store.append(last_kept_result)
                job_status.log(
                    agent_id, task,
                    f"Soul autopilot: done — {kept} kept, {discarded} discarded "
                    f"(final score {current_baseline:.3f})"
                )
            else:
                job_status.log(agent_id, task, f"Soul autopilot: done — all {discarded} suggestion(s) discarded")

            suggestions_path.write_text("", "utf-8")

        except Exception as e:
            logger.warning(f"[{agent_id}] Soul autopilot failed (non-fatal): {e}")

    def _call_thesis_validation_safely(self) -> None:
        """Run thesis validation; swallow errors so consolidation succeeds."""
        try:
            self.run_thesis_validation()
        except Exception:
            logger.warning(f"[{self._config.agent_id}] Thesis validation failed; consolidation continues.")

    def _write_pruning_log(self, pruned: list[str]) -> None:
        from datetime import datetime, timezone
        path = self._dir / "pruning_log.md"
        existing = path.read_text(encoding="utf-8") if path.exists() else "# Pruning Log\n"
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        block = f"\n## {ts}\nArchived {len(pruned)} file(s):\n"
        block += "\n".join(f"- `{p}`" for p in pruned) + "\n"
        path.write_text(existing + block, encoding="utf-8")

    def _update_index(self, files: list[dict]) -> None:
        lines = ["# Knowledge Index\n"]
        for f in files[:20]:
            lines.append(f"- `{f['path']}` — weight: {f['effective_weight']:.3f}")
        index_path = self._dir / "knowledge" / "_index.md"
        index_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.write_text("\n".join(lines), encoding="utf-8")
