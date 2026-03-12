import pathlib
import logging
from datetime import datetime, timezone

from core.inbox import InboxWriter
from core.models.types import AgentConfig, ResearchFinding, DiscoveredSource, AnalysisResult
from core import job_status

logger = logging.getLogger(__name__)

_DISCOVERED_SOURCES_FILE = "discovered_sources.md"


class SelfImprovingSession:
    def __init__(self, agent_dir: pathlib.Path, config: AgentConfig, provider, soul: str):
        self._dir = agent_dir
        self._config = config
        self._provider = provider
        self._soul = soul

    def run(self) -> None:
        agent_id = self._config.agent_id
        task = "self-improving"
        job_status.start(agent_id, task, "Preparing self-improving context...")

        try:
            index_path = self._dir / "knowledge" / "_index.md"
            knowledge_index = index_path.read_text(encoding="utf-8") if index_path.exists() else ""
            existing_sources = self._format_existing_sources()

            job_status.update_step(agent_id, task, "Running autonomous research session with web search...")
            findings, new_sources = self._provider.research_domain(
                soul=self._soul,
                knowledge_index=knowledge_index,
                existing_sources=existing_sources,
            )

            if not findings and not new_sources:
                logger.info("Self-improving session returned no findings or sources.")
                job_status.complete(agent_id, task)
                return

            if findings:
                job_status.update_step(agent_id, task, f"Writing {len(findings)} findings to inbox...")
                inbox = InboxWriter(self._dir)
                for finding in findings:
                    self._append_finding_to_inbox(inbox, finding)

            if new_sources:
                job_status.update_step(agent_id, task, f"Logging {len(new_sources)} discovered sources...")
                self._log_discovered_sources(new_sources)
                self._auto_add_sources(new_sources)

            logger.info(
                f"[{agent_id}] Self-improving session complete: "
                f"{len(findings)} findings, {len(new_sources)} new sources"
            )
            job_status.complete(agent_id, task)

        except Exception as e:
            logger.error(f"[{agent_id}] Self-improving session failed: {e}")
            job_status.fail(agent_id, task, str(e))
            raise

    def _format_existing_sources(self) -> str:
        lines = []
        for ch in self._config.sources.get("youtube_channels", []):
            lines.append(f"- YouTube: {ch['handle']}")
        discovered = self._dir / _DISCOVERED_SOURCES_FILE
        if discovered.exists():
            lines.append("\nPreviously discovered (already suggested):")
            lines.append(discovered.read_text(encoding="utf-8"))
        return "\n".join(lines) if lines else "None yet."

    def _append_finding_to_inbox(self, inbox: InboxWriter, finding: ResearchFinding) -> None:
        pseudo_id = f"self-improving-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
        result = AnalysisResult(
            video_id=pseudo_id,
            video_title=finding.title,
            insights=finding.insights,
            relevance_score=finding.relevance_score,
            suggested_action=finding.suggested_action,
            suggested_target=finding.suggested_target,
            raw_summary=finding.raw_summary,
        )
        inbox.append("self-improving", result)

    def _log_discovered_sources(self, sources: list[DiscoveredSource]) -> None:
        dest = self._dir / _DISCOVERED_SOURCES_FILE
        existing = dest.read_text(encoding="utf-8") if dest.exists() else "# Discovered Sources\n\n"
        new_entries = []
        for s in sources:
            new_entries.append(
                f"## {s.discovered_at}\n"
                f"- **URL:** {s.url}\n"
                f"- **Type:** {s.source_type}\n"
                f"- **Handle:** {s.handle or 'N/A'}\n"
                f"- **Rationale:** {s.rationale}\n"
            )
        dest.write_text(existing + "\n".join(new_entries), encoding="utf-8")

    def _auto_add_sources(self, sources: list[DiscoveredSource]) -> None:
        """Add newly discovered YouTube channels to agent config (disk + memory)."""
        if not sources:
            return
        existing_handles = {
            ch["handle"]
            for ch in self._config.sources.get("youtube_channels", [])
        }
        added = []
        for s in sources:
            if s.source_type != "youtube_channel" or not s.handle:
                continue
            handle = s.handle if s.handle.startswith("@") else f"@{s.handle}"
            if handle in existing_handles:
                continue
            self._config.sources.setdefault("youtube_channels", []).append({"handle": handle})
            existing_handles.add(handle)
            added.append(handle)
        if added:
            import yaml
            from core.config import save_agent_config
            config_path = self._dir / "config.yaml"
            raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
            raw["sources"] = self._config.sources
            save_agent_config(config_path, raw)
            logger.info(f"[{self._config.agent_id}] Auto-added {len(added)} sources: {added}")
