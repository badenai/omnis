import ipaddress
import pathlib
import logging
import re
import urllib.parse
from datetime import datetime, timezone

from core.inbox import InboxWriter
from core.models.types import AgentConfig, ResearchFinding, DiscoveredSource, AnalysisResult
from core import job_status

logger = logging.getLogger(__name__)

_DISCOVERED_SOURCES_FILE = "discovered_sources.md"


def _compute_source_id(s: "DiscoveredSource") -> str:
    if s.source_type == "youtube_channel" and s.handle:
        handle = s.handle if s.handle.startswith("@") else f"@{s.handle}"
        return handle
    if s.source_type in ("blog", "podcast") and s.url:
        m = re.match(r'https://medium\.com/(@\w+)', s.url)
        if m:
            return f"medium:{m.group(1)}"
        return s.url
    if s.source_type == "website" and s.url:
        return s.url
    return s.handle or s.url or ""


_AUTH_PATH_PREFIXES = (
    "/login", "/signin", "/sign-in", "/auth",
    "/subscribe", "/paywall", "/register", "/account/login",
)


def _check_source_safety(s: "DiscoveredSource") -> tuple[bool, str]:
    """Returns (is_safe, rejection_reason). Empty reason means safe."""
    try:
        parsed = urllib.parse.urlparse(s.url)
        if parsed.scheme not in ("http", "https"):
            return False, f"Unsupported scheme: {parsed.scheme!r}"
        hostname = parsed.hostname or ""
        if not hostname or hostname in ("localhost",) or hostname.endswith(".local"):
            return False, "Private/reserved hostname"
        try:
            addr = ipaddress.ip_address(hostname)
            if addr.is_private or addr.is_loopback or addr.is_reserved or addr.is_link_local:
                return False, "Private/reserved IP"
        except ValueError:
            pass
    except Exception as e:
        return False, f"Invalid URL: {e}"

    try:
        import httpx
        resp = httpx.head(s.url, follow_redirects=True, timeout=10,
                          headers={"User-Agent": "OmnisBot/1.0"})
        if resp.status_code in (401, 402, 403):
            return False, f"HTTP {resp.status_code}"
        final_path = urllib.parse.urlparse(str(resp.url)).path.lower()
        if any(final_path.startswith(p) for p in _AUTH_PATH_PREFIXES):
            return False, "Redirected to auth/paywall path"
    except Exception as e:
        logger.warning(f"HEAD check failed for {s.url}: {e} — allowing")

    return True, ""


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
                job_status.update_step(agent_id, task, f"Validating {len(new_sources)} discovered sources...")
                accepted: list[DiscoveredSource] = []
                one_time: list[DiscoveredSource] = []
                rejected: list[tuple[DiscoveredSource, str]] = []
                for s in new_sources:
                    is_safe, reason = _check_source_safety(s)
                    if not is_safe:
                        rejected.append((s, reason))
                    elif s.is_recurring:
                        accepted.append(s)
                    else:
                        one_time.append(s)
                logger.info(
                    f"[{agent_id}] Sources: {len(accepted)} recurring, "
                    f"{len(one_time)} one-time, {len(rejected)} rejected"
                )
                self._log_discovered_sources(accepted, one_time, rejected)
                self._auto_add_sources(accepted)
                for s in one_time:
                    self._ingest_once(s)

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
        for s in self._config.sources:
            label = s.get("handle") or s.get("url") or s.get("subreddit", "")
            lines.append(f"- {s['type'].title()}: {label}")
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
        inbox.append("self-improving", result, sources=finding.sources_consulted)

    def _ingest_once(self, s: DiscoveredSource) -> None:
        """Fetch a non-recurring source once and add its insights to inbox."""
        import httpx
        from markdownify import markdownify
        try:
            resp = httpx.get(s.url, follow_redirects=True, timeout=20,
                             headers={"User-Agent": "OmnisBot/1.0"})
            resp.raise_for_status()
            m = re.search(r'<title[^>]*>(.*?)</title>', resp.text, re.I | re.S)
            title = m.group(1).strip() if m else s.url
            content = markdownify(resp.text, strip=["script", "style", "nav", "footer"])[:12000]
            result = self._provider.analyze_web_content(s.url, content, title, self._soul)
            InboxWriter(self._dir).append(s.url, result, sources=[s.url])
            logger.info(f"[{self._config.agent_id}] One-time ingested: {s.url}")
        except Exception as e:
            logger.warning(f"One-time ingest failed for {s.url}: {e}")

    def _log_discovered_sources(
        self,
        accepted: list[DiscoveredSource],
        one_time: list[DiscoveredSource],
        rejected: list[tuple[DiscoveredSource, str]],
    ) -> None:
        dest = self._dir / _DISCOVERED_SOURCES_FILE
        existing = dest.read_text(encoding="utf-8") if dest.exists() else "# Discovered Sources\n\n"
        new_entries = []
        for s in accepted:
            new_entries.append(
                f"## {s.discovered_at}\n"
                f"- **URL:** {s.url}\n- **Type:** {s.source_type}\n"
                f"- **Handle:** {s.handle or 'N/A'}\n"
                f"- **Source ID:** {_compute_source_id(s)}\n"
                f"- **Status:** accepted\n"
                f"- **Rationale:** {s.rationale}\n"
            )
        for s in one_time:
            new_entries.append(
                f"## {s.discovered_at}\n"
                f"- **URL:** {s.url}\n- **Type:** {s.source_type}\n"
                f"- **Handle:** {s.handle or 'N/A'}\n"
                f"- **Source ID:** {_compute_source_id(s)}\n"
                f"- **Status:** one-time\n"
                f"- **Rationale:** {s.rationale}\n"
            )
        for s, reason in rejected:
            new_entries.append(
                f"## {s.discovered_at}\n"
                f"- **URL:** {s.url}\n- **Type:** {s.source_type}\n"
                f"- **Handle:** {s.handle or 'N/A'}\n"
                f"- **Source ID:** {_compute_source_id(s)}\n"
                f"- **Status:** rejected — {reason}\n"
                f"- **Rationale:** {s.rationale}\n"
            )
        dest.write_text(existing + "\n".join(new_entries), encoding="utf-8")

    def _auto_add_sources(self, sources: list[DiscoveredSource]) -> None:
        """Add newly discovered sources to agent config (disk + memory)."""
        import re
        if not sources:
            return
        existing_handles = {
            s["handle"]
            for s in self._config.sources
            if s.get("type") == "youtube" and s.get("handle")
        }
        existing_urls = {
            s["url"]
            for s in self._config.sources
            if s.get("url")
        }
        existing_medium_handles = {
            s["handle"]
            for s in self._config.sources
            if s.get("type") == "medium" and s.get("handle")
        }
        added = []
        for s in sources:
            if s.source_type == "youtube_channel" and s.handle:
                handle = s.handle if s.handle.startswith("@") else f"@{s.handle}"
                if handle in existing_handles:
                    continue
                self._config.sources.append({"type": "youtube", "handle": handle})
                existing_handles.add(handle)
                added.append(handle)
            elif s.source_type in ("blog", "podcast") and s.url:
                m = re.match(r'https://medium\.com/(@\w+)', s.url)
                if m:
                    medium_handle = m.group(1)
                    if medium_handle in existing_medium_handles:
                        continue
                    self._config.sources.append({"type": "medium", "handle": medium_handle})
                    existing_medium_handles.add(medium_handle)
                else:
                    if s.url in existing_urls:
                        continue
                    self._config.sources.append({"type": "web_page", "url": s.url})
                    existing_urls.add(s.url)
                added.append(s.url)
            elif s.source_type == "website" and s.url:
                if s.url in existing_urls:
                    continue
                self._config.sources.append({"type": "web_page", "url": s.url})
                existing_urls.add(s.url)
                added.append(s.url)
        if added:
            import yaml
            from core.config import save_agent_config
            config_path = self._dir / "config.yaml"
            raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
            raw["sources"] = self._config.sources
            save_agent_config(config_path, raw)
            logger.info(f"[{self._config.agent_id}] Auto-added {len(added)} sources: {added}")
