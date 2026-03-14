import json
import logging
import pathlib
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_MAX_LEARNINGS_ENTRIES = 20  # cap passed to generate_skill to keep prompt manageable


def analyze_regression(agent_dir: pathlib.Path, provider) -> str:
    """Analyze why a skill regressed and return a markdown-formatted learning.

    Reads SKILL.diff, the latest skill_quality.json entry, and SKILL.rejected.md,
    then asks the provider to identify the root cause and actionable anti-patterns.

    Falls back to diff-only analysis if skill_quality.json has no grader reasoning.
    Returns an empty string if the required files are missing or the LLM call fails.
    """
    diff_path = agent_dir / "SKILL.diff"
    rejected_path = agent_dir / "SKILL.rejected.md"
    quality_path = agent_dir / "skill_quality.json"

    diff_text = diff_path.read_text("utf-8") if diff_path.exists() else ""
    rejected_text = rejected_path.read_text("utf-8") if rejected_path.exists() else ""

    grader_context = ""
    score_info = ""
    if quality_path.exists():
        try:
            history = json.loads(quality_path.read_text("utf-8"))
            if history:
                latest = history[0]
                score_info = f"Score: {latest.get('score', '?')} (version {latest.get('skill_version', '?')})"
                if len(history) >= 2:
                    prev_score = history[1].get("score", "?")
                    score_info += f" — previous: {prev_score}"
                evals = latest.get("eval_results", [])
                if evals:
                    lines = []
                    for ev in evals:
                        reasoning = ev.get("grader_reasoning", "")
                        delta = ev.get("delta", 0)
                        if reasoning:
                            lines.append(f"  delta={delta:+.2f}: {reasoning}")
                    grader_context = "\n".join(lines)
        except Exception as e:
            logger.warning(f"Could not read skill_quality.json for regression analysis: {e}")

    prompt = (
        "You are analyzing a SKILL.md regression. The skill's quality score dropped, "
        "and you must identify the root cause and define anti-patterns to prevent recurrence.\n\n"
    )
    if score_info:
        prompt += f"## Score Change\n{score_info}\n\n"
    if grader_context:
        prompt += f"## Grader Reasoning (per prompt)\n{grader_context}\n\n"
    if diff_text:
        prompt += f"## Diff (what changed)\n```diff\n{diff_text[:4000]}\n```\n\n"
    if rejected_text:
        prompt += f"## Rejected Skill (the bad version, truncated)\n{rejected_text[:3000]}\n\n"

    prompt += (
        "Based on the above, produce a concise regression learning in this exact markdown format:\n\n"
        "**Root cause:** [One sentence identifying the specific element that caused the regression]\n\n"
        "**Anti-patterns:**\n"
        "- Avoid [specific thing] because [reason it hurts skill quality]\n"
        "- [repeat for each anti-pattern, max 4]\n\n"
        "**Class of error:** [Short label, e.g. 'Vocabulary contamination', 'Over-abstraction', "
        "'Domain bleed']\n\n"
        "Be specific. Reference actual terms or patterns from the diff/rejected skill where possible."
    )

    try:
        return provider._generate(prompt, model=provider._consolidation_model_name)
    except Exception as e:
        logger.warning(f"Regression analysis LLM call failed: {e}")
        return ""


def save_learnings(agent_dir: pathlib.Path, analysis: str, agent_id: str, score_before: float | None = None, score_after: float | None = None) -> None:
    """Append a timestamped regression learning to skill_learnings.md."""
    if not analysis.strip():
        return

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    score_line = ""
    if score_before is not None and score_after is not None:
        score_line = f" (score: {score_before} → {score_after})"

    section = (
        f"\n## Regression {ts} — {agent_id}{score_line}\n\n"
        f"{analysis.strip()}\n"
    )

    learnings_path = agent_dir / "skill_learnings.md"
    existing = learnings_path.read_text("utf-8") if learnings_path.exists() else ""
    learnings_path.write_text(existing + section, "utf-8")


def read_learnings(agent_dir: pathlib.Path, max_entries: int = _MAX_LEARNINGS_ENTRIES) -> str | None:
    """Read skill_learnings.md and return the last N regression entries, or None if absent."""
    learnings_path = agent_dir / "skill_learnings.md"
    if not learnings_path.exists():
        return None
    content = learnings_path.read_text("utf-8").strip()
    if not content:
        return None

    # Split on the section markers and keep the last max_entries sections
    import re
    sections = re.split(r'(?=^## Regression )', content, flags=re.MULTILINE)
    sections = [s.strip() for s in sections if s.strip()]
    if len(sections) > max_entries:
        sections = sections[-max_entries:]
    return "\n\n".join(sections)
