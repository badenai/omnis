"""On-demand optimizer for the SKILL.md description field.

Uses Gemini to iteratively test and improve the description field so Claude
triggers the skill accurately. No external CLI or plugin dependency required.
"""
import json
import logging
import pathlib
import re

from core import job_status

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Eval set generation
# ---------------------------------------------------------------------------

def generate_trigger_eval_set(soul: str, provider) -> list[dict]:
    """Generate 20 trigger evaluation queries using Gemini.

    Returns list of {"query": str, "should_trigger": bool}:
    - 10 that SHOULD trigger (clearly within soul's domain)
    - 10 that should NOT (near-misses: similar topic, out of scope)
    """
    prompt = (
        f"AGENT SOUL:\n{soul}\n\n"
        f"Generate exactly 20 queries to evaluate whether a Claude Code skill should trigger.\n"
        f"- 10 queries that SHOULD trigger (clearly within this soul's domain)\n"
        f"- 10 queries that should NOT trigger (near-misses: similar topic, out of scope)\n\n"
        f"Respond with valid JSON only, no markdown fences:\n"
        f'[{{"query": "...", "should_trigger": true}}, ...]'
    )
    raw = provider._generate(prompt, model=provider._consolidation_model_name)
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(text)


# ---------------------------------------------------------------------------
# Native Gemini optimization loop
# ---------------------------------------------------------------------------

def _extract_description(skill_content: str) -> str | None:
    """Extract the description value from SKILL.md YAML frontmatter."""
    m = re.search(r'^---\n(?:(?!---).)*?description:\s*(.+?)(?:\n[a-z]|\n---)', skill_content, re.DOTALL)
    if not m:
        # Simpler single-line match
        m = re.search(r'^description:\s*(.+)$', skill_content, re.MULTILINE)
    if not m:
        return None
    return m.group(1).strip()


def _score_description(
    description: str, eval_set: list[dict], provider
) -> tuple[float, list[dict]]:
    """Ask Gemini whether this description would trigger for each eval query.

    Returns (accuracy_score, list_of_misses).
    A miss is {"query": ..., "should_trigger": bool, "got": bool}.
    """
    queries_text = "\n".join(
        f"{i + 1}. {item['query']}"
        for i, item in enumerate(eval_set)
    )
    prompt = (
        f"SKILL DESCRIPTION:\n{description}\n\n"
        f"For each query below, decide: would an AI assistant activate a skill "
        f"with the above description to help answer it?\n"
        f"Answer YES (the description matches — skill should activate) or "
        f"NO (the description does not match — skill should not activate).\n\n"
        f"Respond with valid JSON only, no markdown fences:\n"
        f'{{"results": [{{"n": 1, "trigger": true}}, ...]}}\n\n'
        f"QUERIES:\n{queries_text}"
    )
    raw = provider._generate(prompt, model=provider._consolidation_model_name)
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]

    try:
        data = json.loads(text)
        results = data.get("results", [])
    except Exception:
        return 0.0, []

    misses = []
    correct = 0
    for i, item in enumerate(eval_set):
        got = results[i]["trigger"] if i < len(results) else (not item["should_trigger"])
        if got == item["should_trigger"]:
            correct += 1
        else:
            misses.append({"query": item["query"], "should_trigger": item["should_trigger"], "got": got})

    score = correct / len(eval_set) if eval_set else 0.0
    return score, misses


def _improve_description(
    current_description: str,
    soul: str,
    skill_content: str,
    misses: list[dict],
    iteration: int,
    provider,
) -> str:
    """Ask Gemini to produce a better description based on the current misses."""
    misses_text = "\n".join(
        f"- {'SHOULD trigger but did not' if m['should_trigger'] else 'should NOT trigger but did'}: {m['query']}"
        for m in misses
    )
    prompt = (
        f"AGENT SOUL (defines the skill's domain):\n{soul[:600]}\n\n"
        f"SKILL CONTENT (first 1500 chars):\n{skill_content[:1500]}\n\n"
        f"CURRENT DESCRIPTION:\n{current_description}\n\n"
        f"TRIGGER ERRORS (iteration {iteration}):\n{misses_text}\n\n"
        f"Rewrite the description to fix these errors. Rules:\n"
        f"- Under 500 characters\n"
        f"- Third-person, never starts with 'I' or 'You'\n"
        f"- Starts with 'Use when' or 'Use for'\n"
        f"- Must not activate for out-of-domain queries\n"
        f"- Must activate for queries clearly within the soul's domain\n\n"
        f"Respond with the description text only — no JSON, no quotes, no explanation."
    )
    return provider._generate(prompt, model=provider._consolidation_model_name).strip()


# ---------------------------------------------------------------------------
# Structure audit
# ---------------------------------------------------------------------------

_STRUCTURE_CRITERIA = """
Evaluate this SKILL.md file for structural and stylistic quality.

SKILL CONTENT:
{skill_content}

Check each of these criteria and identify any issues:

1. description_trigger_conditions — The description: field must specify WHEN to trigger (specific contexts, user phrases, use-cases), not just explain what the skill does. Generic descriptions like "Use when working with X" without concrete trigger contexts are too vague.
2. when_to_use_in_body — The body must NOT contain a "When to Use" section. Trigger conditions belong only in the description: field. If there is such a section in the body, it is redundant.
3. redundant_intro_paragraph — A prose paragraph at the top of the body that just restates what the skill does (e.g. "This skill helps you...", "Translate subjective X into Y") adds no value. The body should begin with actionable instructions.
4. announce_at_start — Lines like "Announce at start: I am using the X skill" are unnecessary and should be removed from generated skills.
5. heavy_caps_imperatives — More than 4 occurrences of MUST/NEVER/ALWAYS in ALL CAPS indicates preachy style. Prefer explaining WHY instead of relying on all-caps emphasis.
6. knowledge_date_line — Lines like "*Knowledge last updated: YYYY-MM-DD*" are metadata noise; timestamps belong in a comment or frontmatter, not inline in the skill body.
7. explanatory_not_actionable — Sections that read like a domain introduction or Wikipedia-style explanation rather than giving Claude specific, actionable instructions.

For each issue found, assign severity:
- "warning" — minor, the skill still works but could be cleaner
- "error" — major, actively hurts clarity or triggering accuracy

Return valid JSON only, no markdown fences:
{{"overall_score": <0-100, where 100 is perfect>, "issues": [{{"severity": "warning"|"error", "criterion": "<name>", "section": "<heading if applicable>", "issue": "<brief description>", "suggestion": "<specific fix>"}}], "summary": "<1-2 sentence overall assessment>"}}
If no issues, return {{"overall_score": 100, "issues": [], "summary": "<positive assessment>"}}
"""


def run_structure_audit(
    agent_dir: pathlib.Path,
    agent_id: str,
    skill_path: pathlib.Path,
    provider,
    job_log_fn,
) -> dict | None:
    """Evaluate SKILL.md for structural and stylistic quality using Gemini.

    Checks criteria from the skill-creator guide: description completeness,
    redundant body sections, writing style, and actionability.
    Saves result to agent_dir/skill_audit.json.
    Returns the audit dict, or None on failure.
    """
    task = "audit-structure"

    if not skill_path.exists():
        job_log_fn(agent_id, task, f"SKILL.md not found at {skill_path} — run consolidation first")
        return None

    skill_content = skill_path.read_text(encoding="utf-8")
    line_count = skill_content.count("\n") + 1

    job_log_fn(agent_id, task, f"Auditing structure ({line_count} lines)…")

    prompt = _STRUCTURE_CRITERIA.format(skill_content=skill_content[:6000])

    try:
        raw = provider._generate(prompt, model=provider._consolidation_model_name).strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        result = json.loads(raw)
    except Exception as e:
        logger.error(f"Structure audit Gemini call failed: {e}")
        job_log_fn(agent_id, task, f"Gemini error: {e}")
        return None

    result["timestamp"] = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
    result["line_count"] = line_count

    # Cap score at 100 and floor at 0
    result["overall_score"] = max(0, min(100, int(result.get("overall_score", 0))))

    audit_path = agent_dir / "skill_audit.json"
    audit_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    issue_count = len(result.get("issues", []))
    job_log_fn(agent_id, task, f"Audit complete — score {result['overall_score']}/100, {issue_count} issue(s)")
    return result


# ---------------------------------------------------------------------------
# Structure auto-rewrite
# ---------------------------------------------------------------------------

def apply_structure_fixes(
    agent_dir: pathlib.Path,
    agent_id: str,
    skill_path: pathlib.Path,
    provider,
    job_log_fn,
) -> bool:
    """Ask Gemini to rewrite SKILL.md to fix the issues found in skill_audit.json.

    Creates a backup at SKILL.previous.md before overwriting.
    Returns True if a rewrite was applied, False if skipped or failed.
    """
    task = "audit-skill"

    audit_path = agent_dir / "skill_audit.json"
    if not audit_path.exists():
        job_log_fn(agent_id, task, "No audit data found — skipping auto-fix")
        return False

    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    issues = audit.get("issues", [])
    if not issues:
        job_log_fn(agent_id, task, "No issues to fix — skipping rewrite")
        return True

    if not skill_path.exists():
        return False

    skill_content = skill_path.read_text(encoding="utf-8")

    issues_text = "\n".join(
        f"- [{i['severity'].upper()}] {i['criterion']}: {i['issue']}\n  Fix: {i['suggestion']}"
        for i in issues
    )

    prompt = (
        f"Rewrite the following SKILL.md to fix ALL of the listed structural issues.\n\n"
        f"ISSUES TO FIX:\n{issues_text}\n\n"
        f"RULES:\n"
        f"- Preserve the YAML frontmatter exactly (name:, description:, etc.)\n"
        f"- Preserve all substantive knowledge content\n"
        f"- Remove or restructure only the problematic sections\n"
        f"- Do not add new content that wasn't there before\n"
        f"- Return the complete rewritten SKILL.md only — no explanation, no markdown fences\n\n"
        f"CURRENT SKILL.md:\n{skill_content}"
    )

    job_log_fn(agent_id, task, f"Rewriting SKILL.md to fix {len(issues)} issue(s)…")

    try:
        new_content = provider._generate(prompt, model=provider._consolidation_model_name).strip()
        # Strip any accidental code fence
        if new_content.startswith("```"):
            new_content = new_content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    except Exception as e:
        logger.error(f"Structure fix Gemini call failed: {e}")
        job_log_fn(agent_id, task, f"Rewrite failed: {e}")
        return False

    if not new_content.startswith("---"):
        job_log_fn(agent_id, task, "Rewrite returned invalid content (no frontmatter) — skipping")
        return False

    # Write backup then update agent-dir copy
    if skill_path.exists():
        (agent_dir / "SKILL.previous.md").write_text(
            skill_path.read_text(encoding="utf-8"), encoding="utf-8"
        )
    skill_path.write_text(new_content, encoding="utf-8")

    # Mirror to agent_dir/skills/{primary} and plugin cache
    primary_path_file = agent_dir / "primary_skill_path.txt"
    if primary_path_file.exists():
        primary_agent_path = pathlib.Path(primary_path_file.read_text("utf-8").strip())
        primary_agent_path.write_text(new_content, encoding="utf-8")
        cluster_name = primary_agent_path.parent.name
        install_path_file = agent_dir / "plugin_install_path.txt"
        if install_path_file.exists():
            install_path = pathlib.Path(install_path_file.read_text("utf-8").strip())
            plugin_cache_path = install_path / "skills" / cluster_name / "SKILL.md"
            if plugin_cache_path.parent.exists():
                plugin_cache_path.write_text(new_content, encoding="utf-8")

    job_log_fn(agent_id, task, "Rewrite applied — SKILL.previous.md saved as backup in agent dir")
    return True


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_description_optimization(
    agent_dir: pathlib.Path,
    agent_id: str,
    skill_path: pathlib.Path,
    soul: str,
    provider,
    job_log_fn,
    max_iterations: int = 5,
) -> str | None:
    """Optimize the SKILL.md description field using a native Gemini loop.

    Iteratively scores and rewrites the description against a 20-query eval set.
    Updates skill_path (agent_dir/SKILL.md) and the plugin cache primary skill on improvement.
    Returns the best description found, or None on failure.
    """
    task = "optimize-description"

    if not skill_path.exists():
        job_log_fn(agent_id, task, f"SKILL.md not found at {skill_path} — run consolidation first")
        return None

    skill_content = skill_path.read_text(encoding="utf-8")
    current_description = _extract_description(skill_content)
    if not current_description:
        job_log_fn(agent_id, task, "Could not extract description from SKILL.md frontmatter")
        return None

    job_log_fn(agent_id, task, f"Starting description: {current_description[:80]}…")

    # 1. Load or generate eval set
    eval_set_path = agent_dir / "trigger_eval.json"
    eval_set = None

    if eval_set_path.exists():
        try:
            eval_set = json.loads(eval_set_path.read_text(encoding="utf-8"))
            job_log_fn(agent_id, task, f"Loaded trigger_eval.json ({len(eval_set)} queries)")
        except Exception:
            eval_set = None

    if not eval_set:
        job_status.update_step(agent_id, task, "Generating trigger evaluation set…")
        job_log_fn(agent_id, task, "Calling Gemini to generate 20 trigger eval queries…")
        try:
            eval_set = generate_trigger_eval_set(soul, provider)
            eval_set_path.write_text(json.dumps(eval_set, indent=2), encoding="utf-8")
            job_log_fn(agent_id, task, f"Generated {len(eval_set)} queries → trigger_eval.json")
        except Exception as e:
            logger.error(f"Failed to generate trigger eval set: {e}")
            job_log_fn(agent_id, task, f"Error generating eval set: {e}")
            return None

    # 2. Optimization loop
    best_description = current_description
    best_score = -1.0
    candidate = current_description

    for iteration in range(1, max_iterations + 1):
        job_status.update_step(
            agent_id, task,
            f"Iteration {iteration}/{max_iterations}: scoring description…"
        )

        score, misses = _score_description(candidate, eval_set, provider)
        job_log_fn(
            agent_id, task,
            f"Iter {iteration}: score={score:.2f} ({len(eval_set) - len(misses)}/{len(eval_set)} correct, {len(misses)} misses)"
        )

        if score > best_score:
            best_score = score
            best_description = candidate
            job_log_fn(agent_id, task, f"  ✓ New best: {best_description[:80]}…")

        # Perfect score — no point continuing
        if score == 1.0:
            job_log_fn(agent_id, task, "Perfect score — stopping early")
            break

        if iteration < max_iterations:
            job_status.update_step(
                agent_id, task,
                f"Iteration {iteration}/{max_iterations}: rewriting description…"
            )
            candidate = _improve_description(
                candidate, soul, skill_content, misses, iteration, provider
            )
            job_log_fn(agent_id, task, f"  → Candidate: {candidate[:80]}…")

    job_log_fn(
        agent_id, task,
        f"Optimization complete — best score {best_score:.2f}: {best_description[:100]}…"
    )

    # 3. Apply if improved (or first run — always write if we got a valid result)
    def _apply(path: pathlib.Path) -> bool:
        if not path.exists():
            return False
        content = path.read_text(encoding="utf-8")
        new_content = re.sub(
            r'^(---\n(?:(?!---).)*?\n?description: ).*?(\n---)',
            lambda m: m.group(1) + best_description + m.group(2),
            content,
            flags=re.DOTALL,
        )
        if new_content != content:
            path.write_text(new_content, encoding="utf-8")
            return True
        return False

    changed_agent = _apply(skill_path)

    # Mirror to agent_dir/skills/{primary} and plugin cache
    changed_agent_skills = False
    primary_path_file = agent_dir / "primary_skill_path.txt"
    if primary_path_file.exists():
        primary_agent_path = pathlib.Path(primary_path_file.read_text("utf-8").strip())
        changed_agent_skills = _apply(primary_agent_path)
        if changed_agent_skills:
            cluster_name = primary_agent_path.parent.name
            install_path_file = agent_dir / "plugin_install_path.txt"
            if install_path_file.exists():
                install_path = pathlib.Path(install_path_file.read_text("utf-8").strip())
                plugin_cache_path = install_path / "skills" / cluster_name / "SKILL.md"
                if plugin_cache_path.parent.exists():
                    _apply(plugin_cache_path)

    job_log_fn(
        agent_id, task,
        f"Updated SKILL.md (agent_dir={changed_agent}, agent_skills={changed_agent_skills})"
    )
    return best_description
