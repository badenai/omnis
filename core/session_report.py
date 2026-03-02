import pathlib
import re
from collections import defaultdict
from datetime import datetime, timezone

from core.models.types import ConsolidationResult

_RE_HEADER = re.compile(r"^## (.+?) \| (.+?) \| (.+?)$", re.MULTILINE)
_RE_TITLE = re.compile(r"^\*\*Title:\*\* (.+?)  $", re.MULTILINE)
_RE_SCORE = re.compile(r"^\*\*Relevance Score:\*\* ([\d.]+)", re.MULTILINE)
_RE_ACTION = re.compile(r"^\*\*Suggested Action:\*\* (\S+) -> `(.+?)`", re.MULTILINE)


def _parse_inbox_item(item: str) -> dict:
    """Parse a raw inbox entry string. Returns a dict with fallback values on partial match."""
    header = _RE_HEADER.search(item)
    title = _RE_TITLE.search(item)
    score = _RE_SCORE.search(item)
    action = _RE_ACTION.search(item)
    return {
        "timestamp": header.group(1) if header else "unknown",
        "channel": header.group(2) if header else "unknown",
        "video_id": header.group(3) if header else "unknown",
        "title": title.group(1).strip() if title else "unknown",
        "relevance_score": float(score.group(1)) if score else 0.0,
        "suggested_action": action.group(1) if action else "unknown",
        "suggested_target": action.group(2) if action else "unknown",
    }


def write_session_report(
    agent_dir: pathlib.Path,
    inbox_items: list[str],
    result: ConsolidationResult,
    knowledge_files_after: list[dict],
    pruned_files: list[str],
    skill_changed: bool,
    digest_changed: bool,
) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    agent_id = agent_dir.name

    # Parse inbox items
    parsed = [_parse_inbox_item(item) for item in inbox_items]

    # Group by channel
    by_channel: dict[str, list] = defaultdict(list)
    for idx, p in enumerate(parsed):
        by_channel[p["channel"]].append((idx, p))

    # Map decisions by inbox_index
    decision_by_index = {d.inbox_index: d for d in result.decisions}

    lines = [
        f"# Session Report — {now}",
        "",
        f"**Agent:** {agent_id}",
        f"**Inbox items processed:** {len(inbox_items)}",
        "",
        "---",
        "",
        "## Videos Analyzed",
        "",
    ]

    if by_channel:
        for channel, entries in by_channel.items():
            lines.append(f"### {channel}")
            lines.append("")
            lines.append("| Title | Score | Action | Target |")
            lines.append("|-------|-------|--------|--------|")
            for idx, p in entries:
                decision = decision_by_index.get(idx)
                action = decision.action if decision else "skipped"
                target = decision.target if decision else p["suggested_target"]
                score_str = f"{p['relevance_score']:.2f}"
                safe_title = p['title'].replace('|', r'\|')
                safe_target = target.replace('|', r'\|')
                lines.append(f"| {safe_title} | {score_str} | {action} | {safe_target} |")
            lines.append("")
    else:
        lines.append("_(no videos)_")
        lines.append("")

    lines += [
        "---",
        "",
        "## Consolidation Decisions",
        "",
        "| # | Action | Target |",
        "|---|--------|--------|",
    ]
    for d in result.decisions:
        lines.append(f"| {d.inbox_index} | {d.action} | {d.target} |")
    if not result.decisions:
        lines.append("| — | — | — |")
    lines.append("")

    # Knowledge base changes
    created = [
        f"concepts/{d.target}.md" for d in result.decisions if d.action == "new_concept"
    ] + [
        f"recent/{d.target}.md" for d in result.decisions if d.action == "new_recent"
    ]
    updated = [f"concepts/{d.target}.md" for d in result.decisions if d.action == "update_concept"]
    pruned = pruned_files or []

    lines += [
        "---",
        "",
        "## Knowledge Base Changes",
        "",
        f"**Created:** {len(created)} file(s)",
    ]
    for f in created:
        lines.append(f"- `{f}`")
    lines.append("")
    lines.append(f"**Updated:** {len(updated)} file(s)")
    for f in updated:
        lines.append(f"- `{f}`")
    lines.append("")
    lines.append(f"**Pruned:** {len(pruned)} file(s)")
    for f in pruned:
        lines.append(f"- `{f}`")
    lines.append("")

    # Output files
    def _file_status(changed: bool, diff_path: pathlib.Path, diff_name: str) -> str:
        if not changed:
            return "no"
        if diff_path.exists():
            return f"yes — see {diff_name}"
        return "yes (new file)"

    skill_status = _file_status(
        skill_changed, agent_dir / "SKILL.diff", "SKILL.diff"
    )
    digest_status = _file_status(
        digest_changed, agent_dir / "digest.diff", "digest.diff"
    )

    lines += [
        "---",
        "",
        "## Output Files",
        "",
        "| File | Changed |",
        "|------|---------|",
        f"| digest.md | {digest_status} |",
        f"| SKILL.md | {skill_status} |",
        "",
    ]

    # Top knowledge
    lines += [
        "---",
        "",
        "## Top Knowledge After Run",
        "",
        "| # | File | Weight |",
        "|---|------|--------|",
    ]
    for rank, kf in enumerate(knowledge_files_after[:10], start=1):
        weight = kf.get("effective_weight", 0.0)
        path = kf.get("path", "unknown")
        lines.append(f"| {rank} | {path} | {weight:.3f} |")
    if not knowledge_files_after:
        lines.append("| — | — | — |")
    lines.append("")

    (agent_dir / "last_session.md").write_text("\n".join(lines), encoding="utf-8")
