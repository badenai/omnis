import pathlib
import logging
from datetime import datetime, timezone

from core.inbox import InboxWriter
from core.models.types import AgentConfig
from core import job_status

logger = logging.getLogger(__name__)

_FACT_CHECK_TEMPLATE = """\
AGENT SOUL:
{soul}

SOURCE: {source_id}

RECENT CONTENT SUMMARIES FROM THIS SOURCE:
{summaries}

TASK: Use Google Search to fact-check the claims in these summaries.
1. Find evidence FOR or AGAINST specific outcome claims
2. Identify if results, returns, or success claims are verifiable or misleading
3. Note if this source's narrative contradicts established evidence

Write a credibility report with the following sections:

## Verdict
<overall assessment: credible | hype | unverified | misleading>

## Evidence For
<supporting evidence found via search>

## Evidence Against
<contradicting evidence found via search>

## Conclusion
<one paragraph summary of overall credibility>
"""


class FactChecker:
    def __init__(self, agent_dir: pathlib.Path, config: AgentConfig, provider, soul: str):
        self._dir = agent_dir
        self._config = config
        self._provider = provider
        self._soul = soul

    def run(self, source_id: str) -> None:
        agent_id = self._config.agent_id
        task = f"fact-check/{source_id}"
        job_status.start(agent_id, task, f"Loading recent summaries for {source_id}...")

        try:
            summaries = self._collect_summaries(source_id)
            if not summaries:
                msg = f"No inbox entries for {source_id} — run collection first"
                logger.info(f"[{agent_id}] {msg}")
                job_status.fail(agent_id, task, msg)
                return

            job_status.update_step(agent_id, task, "Running fact-check with web search...")
            prompt = _FACT_CHECK_TEMPLATE.format(
                soul=self._soul,
                source_id=source_id,
                summaries=summaries,
            )
            report = self._provider._generate_with_search(prompt)

            job_status.update_step(agent_id, task, "Writing fact-check report...")
            report_path = self._write_report(source_id, report)

            logger.info(f"[{agent_id}] Fact-check complete for {source_id}")
            job_status.log(agent_id, task, f"Report written → {report_path}")
            job_status.complete(agent_id, task)

        except Exception as e:
            logger.error(f"[{agent_id}] Fact-check failed for {source_id}: {e}")
            job_status.fail(agent_id, task, str(e))
            raise

    def _collect_summaries(self, source_id: str) -> str:
        """Extract recent raw_summary lines from INBOX.md for this source."""
        inbox_path = self._dir / "INBOX.md"
        if not inbox_path.exists():
            return ""

        lines = inbox_path.read_text(encoding="utf-8").splitlines()
        summaries = []
        in_block = False
        current_lines: list[str] = []

        for line in lines:
            if line.startswith("## Source:") and source_id in line:
                in_block = True
                current_lines = [line]
            elif line.startswith("## Source:") and in_block:
                summaries.append("\n".join(current_lines))
                if len(summaries) >= 10:
                    break
                in_block = False
                current_lines = []
            elif in_block:
                current_lines.append(line)

        if in_block and current_lines:
            summaries.append("\n".join(current_lines))

        return "\n\n---\n\n".join(summaries[-10:])

    def _write_report(self, source_id: str, report: str) -> str:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        safe_id = source_id.lstrip("@").replace("/", "-")
        dest = self._dir / "knowledge" / "recent" / month / f"fact-check-{safe_id}.md"
        dest.parent.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).isoformat()
        header = (
            f"---\ncreated: {ts[:10]}\nupdated: {ts[:10]}\n"
            f"relevance_score: 1.0\ndecay_half_life: 30\n"
            f"tags: [fact-check, {safe_id}]\n---\n\n"
            f"# Fact-Check: {source_id}\n\n"
            f"*Generated: {ts}*\n\n"
        )
        dest.write_text(header + report, encoding="utf-8")
        return f"knowledge/recent/{month}/fact-check-{safe_id}.md"
