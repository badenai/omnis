import json
import logging
from google import genai
from google.genai import errors as genai_errors
from tenacity import (
    retry, retry_if_exception, stop_after_attempt, wait_exponential,
)
from core.models.types import (
    AnalysisResult, ConsolidationResult, ConsolidationDecision,
    ResearchFinding, DiscoveredSource, ThesisValidationResult, CredibilitySignals,
    SkillEvalResult, PromptEvalResult,
)

logger = logging.getLogger(__name__)


def _is_transient_api_error(exc: BaseException) -> bool:
    """True for Gemini errors that are safe to retry (rate-limit, overload, transient 5xx)."""
    return isinstance(exc, genai_errors.ServerError) and exc.code in (429, 500, 503)


def _log_retry(retry_state) -> None:
    """Log retry events to both the Python logger and the active job's activity log."""
    from core import job_status
    exc = retry_state.outcome.exception()
    wait = getattr(retry_state.next_action, "sleep", 0)
    attempt = retry_state.attempt_number
    code = getattr(exc, "code", "") if exc else ""
    err = f"{code} " if code else ""
    err += type(exc).__name__ if exc else "error"
    msg = f"↻ retrying in {wait:.0f}s — attempt {attempt}/4 failed ({err})"
    logger.warning(msg)
    ctx = job_status.get_current()
    if ctx:
        job_status.log(ctx[0], ctx[1], msg)


_api_retry = retry(
    retry=retry_if_exception(_is_transient_api_error),
    wait=wait_exponential(multiplier=2, min=5, max=60),
    stop=stop_after_attempt(4),
    before_sleep=_log_retry,
    reraise=True,
)


_ANALYSIS_SCHEMA = """
Respond with valid JSON only, no markdown fences:
{
  "video_id": "<id>",
  "video_title": "<title>",
  "insights": ["<insight>", ...],
  "relevance_score": <0.0-1.0>,
  "suggested_action": "<update_concept|new_concept|new_recent>",
  "suggested_target": "<filename-hint-no-extension>",
  "raw_summary": "<full summary>",
  "credibility_signals": {
    "hype_pattern": false,
    "unverified_claims": false,
    "hype_phrases": []
  }
}

Credibility evaluation:
- hype_pattern: true if the content relies on superlatives or promises without evidence (e.g. "guaranteed profits", "life-changing results", "everyone is doing this").
- unverified_claims: true if specific outcome claims (income figures, returns, results) are made without verifiable sources.
- hype_phrases: up to 3 short example phrases from the content that triggered the above flags (empty list if none).
"""

_REEVALUATE_SCHEMA = """
Respond with valid JSON only, no markdown fences:
{"scores": [{"path": "<relative_path>", "score": <0.0-1.0>}, ...]}
"""


_RESEARCH_PROMPT_TEMPLATE = """\
AGENT SOUL:
{soul}

EXISTING KNOWLEDGE INDEX (extend or challenge — do not repeat verbatim):
{knowledge_index}

KNOWN SOURCES ALREADY MONITORED:
{existing_sources}

TASK: You are an autonomous researcher. Using Google Search, conduct a focused research \
session on the topics defined in your soul. Goals:
1. Find new insights, recent developments, counter-evidence, or updates to existing knowledge
2. Identify up to 5 genuinely new sources worth monitoring regularly (only if found)

After your research, output ONLY the delimited blocks below. No other text.
Cap findings at 10 blocks maximum.

For each insight cluster:
---FINDING_START---
TITLE: <short label>
ACTION: <update_concept|new_concept|new_recent>
TARGET: <kebab-case-filename-hint>
RELEVANCE: <0.0-1.0>
SOURCES:
- <url consulted>
INSIGHTS:
- <bullet point insight>
SUMMARY:
<narrative paragraph>
---FINDING_END---

For each new source worth monitoring:
---SOURCE_START---
URL: <full url>
TYPE: <youtube_channel|blog|website|podcast>
HANDLE: <@handle or NONE>
RATIONALE: <one sentence>
---SOURCE_END---
"""

_VALIDATION_PROMPT_TEMPLATE = """\
AGENT SOUL:
{soul}

TOP KNOWLEDGE FILES (most relevant first):
{files_text}

TASK: You are a critical researcher. Use Google Search to find:
1. Recent evidence that contradicts or significantly updates any of the above
2. Deprecated information (outdated practices, defunct tools, changed circumstances)
3. Important recent developments the knowledge base is missing

For each concern:
---FLAG_START---
PATH: <relative/path/to/file.md>
SEVERITY: <low|medium|high>
CONCERN: <one sentence describing what changed or contradicts this>
---FLAG_END---

After all flags, write:
VALIDATION_SUMMARY:
<narrative paragraph summarizing the overall health of the knowledge base>
"""


class GeminiProvider:
    def __init__(
        self,
        api_key: str,
        model_name: str = "gemini-3-flash-preview",
        consolidation_model_name: str = "gemini-3.1-pro-preview",
    ):
        self._client = genai.Client(api_key=api_key)
        self._model_name = model_name
        self._consolidation_model_name = consolidation_model_name

    @_api_retry
    def _generate(self, contents: str | list, model: str | None = None) -> str:
        response = self._client.models.generate_content(
            model=model or self._model_name,
            contents=contents,
        )
        return response.text

    def _parse_credibility_signals(self, data: dict) -> "CredibilitySignals | None":
        raw = data.get("credibility_signals")
        if not isinstance(raw, dict):
            return None
        return CredibilitySignals(
            hype_pattern=bool(raw.get("hype_pattern", False)),
            unverified_claims=bool(raw.get("unverified_claims", False)),
            hype_phrases=raw.get("hype_phrases", [])[:3],
        )

    def _parse_result(self, raw: str) -> dict:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error(
                f"Failed to parse model response as JSON: {e}\nRaw response:\n{raw[:500]}"
            )
            raise

    def _build_analysis_result(self, data: dict) -> AnalysisResult:
        credibility_signals = self._parse_credibility_signals(data)
        data.pop("credibility_signals", None)
        return AnalysisResult(**data, credibility_signals=credibility_signals)

    def analyze_transcript(
        self, video_id: str, video_title: str, transcript: str, soul: str, prompt: str
    ) -> AnalysisResult:
        contents = (
            f"AGENT SOUL:\n{soul}\n\nTASK:\n{prompt}\n\n{_ANALYSIS_SCHEMA}\n\n"
            f"VIDEO ID: {video_id}\nTITLE: {video_title}\n\nTRANSCRIPT:\n{transcript}"
        )
        data = self._parse_result(self._generate(contents))
        return self._build_analysis_result(data)

    def analyze_video(
        self, video_id: str, video_title: str, video_url: str, soul: str, prompt: str
    ) -> AnalysisResult:
        contents = (
            f"AGENT SOUL:\n{soul}\n\nTASK:\n{prompt}\n\n{_ANALYSIS_SCHEMA}\n\n"
            f"VIDEO ID: {video_id}\nTITLE: {video_title}\nYOUTUBE URL: {video_url}\n\n"
            f"Analyze the YouTube video at the URL above. "
            f"Extract insights relevant to the agent's domain."
        )
        data = self._parse_result(self._generate(contents))
        return self._build_analysis_result(data)

    def analyze_web_content(
        self, url: str, text: str, title: str, soul: str
    ) -> AnalysisResult:
        """Analyze scraped webpage text."""
        contents = (
            f"AGENT SOUL:\n{soul}\n\n"
            f"TASK: Extract key insights relevant to this agent's domain.\n"
            f"{_ANALYSIS_SCHEMA}\n"
            f"SOURCE URL: {url}\n"
            f"TITLE: {title}\n\n"
            f"PAGE CONTENT:\n{text[:12000]}"
        )
        raw = self._generate(contents, model=self._model_name)
        return self._build_analysis_result(self._parse_result(raw))

    def analyze_uploaded_file(
        self, file_bytes: bytes, mime_type: str, title: str, soul: str
    ) -> AnalysisResult:
        """Upload binary file to Gemini Files API and analyze it."""
        import io
        import time
        file_ref = self._client.files.upload(
            file=io.BytesIO(file_bytes),
            config={"mime_type": mime_type, "display_name": title},
        )
        # Files start in PROCESSING state — poll until ACTIVE before use.
        for _ in range(30):
            info = self._client.files.get(name=file_ref.name)
            if info.state.name == "ACTIVE":
                break
            if info.state.name == "FAILED":
                raise RuntimeError(f"Gemini file processing failed for {title!r}")
            time.sleep(2)
        else:
            raise RuntimeError(f"Timed out waiting for Gemini file {file_ref.name} to become ACTIVE")
        prompt = (
            f"AGENT SOUL:\n{soul}\n\n"
            f"TASK: Extract key insights from this file relevant to this agent's domain.\n"
            f"{_ANALYSIS_SCHEMA}\n"
            f"FILE TITLE: {title}"
        )
        response = self._client.models.generate_content(
            model=self._model_name,
            contents=[file_ref, prompt],
        )
        try:
            self._client.files.delete(name=file_ref.name)
        except Exception:
            pass
        return self._build_analysis_result(self._parse_result(response.text))

    def generate_digest(self, knowledge_files: list[dict], soul: str) -> str:
        from datetime import date
        today = date.today().isoformat()
        files_text = "\n\n---\n\n".join(
            f"# {f['path']}\n{f['content']}" for f in knowledge_files
        )
        contents = (
            f"AGENT SOUL:\n{soul}\n\n"
            f"Based on the following knowledge files (sorted by effective_weight descending), "
            f"write a comprehensive memory document in Markdown. Begin with the line:\n"
            f"'*Knowledge last updated: {today}*'\n\n"
            f"Then structure:\n"
            f"## Core Knowledge (by weight)\n"
            f"## Recent Developments (last 30 days)\n"
            f"## Open Questions / Counter-Evidence\n\n"
            f"Where possible, include inline source references like [topic](concepts/topic.md).\n\n"
            f"KNOWLEDGE FILES:\n{files_text}"
        )
        return self._generate(contents, model=self._consolidation_model_name)

    def generate_skill(self, digest: str, soul: str, agent_id: str) -> str:
        from datetime import date
        today = date.today().isoformat()
        contents = (
            f"AGENT SOUL:\n{soul}\n\n"
            f"AGENT ID: {agent_id}\n\n"
            f"You are writing a Claude Code SKILL.md file.\n"
            f"This is NOT a knowledge summary. It is an ACTIVATION PROTOCOL —\n"
            f"a behavioral instruction set that changes how Claude reasons and acts\n"
            f"when implementing code in this domain.\n\n"
            f"Required sections:\n\n"
            f"1. YAML frontmatter with:\n"
            f"   name: {agent_id}\n"
            f"   description: <'Use when [specific trigger conditions only]' — under 500 chars,\n"
            f"                 no workflow summary, just the situations that activate this skill,\n"
            f"                 third-person, never starts with 'I' or 'You'>\n\n"
            f"2. ## Overview\n"
            f"   One-sentence core principle. Then announce line:\n"
            f"   'Announce at start: I am using the {agent_id} skill.'\n"
            f"   Then: '*Knowledge last updated: {today}*'\n\n"
            f"3. ## When to Use\n"
            f"   Explicit trigger conditions as bullets. Include 'When NOT to use' if relevant.\n\n"
            f"4. ## The Iron Law\n"
            f"   The single non-negotiable constraint, in a fenced code block for emphasis.\n\n"
            f"5. ## Behavioral Rules\n"
            f"   Imperative rules using MUST / NEVER / BEFORE / WHEN.\n"
            f"   Action-oriented: 'BEFORE writing X, verify Y' — not 'X is a technique that...'\n\n"
            f"6. ## Red Flags\n"
            f"   A table of domain-specific rationalizations someone would actually think,\n"
            f"   paired with why each is wrong. Format: | Rationalization | Why It's Wrong |\n\n"
            f"7. ## Quick Reference\n"
            f"   Compact table: Allowed vs. Forbidden (or equivalent checklist).\n\n"
            f"Writing rules:\n"
            f"- Extract BEHAVIORAL CONSTRAINTS from the knowledge — not the knowledge itself\n"
            f"- Every sentence must be imperative or conditional, never descriptive\n"
            f"- Red flags must be realistic excuses, not generic ones\n"
            f"- Concise and scannable: Claude reads this before acting, not for research\n\n"
            f"KNOWLEDGE DIGEST (extract behavioral rules from this — do not summarize it):\n"
            f"{digest}"
        )
        return self._generate(contents, model=self._consolidation_model_name)

    def consolidate(
        self, inbox_items: list[str], existing_index: str, soul: str
    ) -> ConsolidationResult:
        inbox_text = "\n\n---\n\n".join(inbox_items)
        contents = (
            f"AGENT SOUL:\n{soul}\n\n"
            f"EXISTING KNOWLEDGE INDEX:\n{existing_index}\n\n"
            f"NEW INBOX ITEMS:\n{inbox_text}\n\n"
            f"For each inbox item, decide:\n"
            f"1. Does it update an existing concept? (action: update_concept, target: filename)\n"
            f"2. Is it a genuinely new concept? (action: new_concept, target: filename-hint)\n"
            f"3. Is it time-sensitive news? (action: new_recent, target: filename-hint)\n\n"
            f"Respond with JSON only:\n"
            f'{{"decisions": [{{"inbox_index": 0, "action": "update_concept", "target": "support-resistance"}}, ...]}}'
        )
        raw = self._generate(contents, model=self._consolidation_model_name)
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        data = json.loads(text)
        updated, created, decisions = [], [], []
        for d in data.get("decisions", []):
            action = d.get("action", "")
            target = d.get("target", "")
            idx = d.get("inbox_index", 0)
            if action == "update_concept":
                updated.append(target)
            elif action in ("new_concept", "new_recent"):
                created.append(target)
            decisions.append(ConsolidationDecision(inbox_index=idx, action=action, target=target))
        return ConsolidationResult(updated_files=updated, created_files=created, decisions=decisions)

    def screen_videos(self, videos: list[dict], soul: str) -> list[str]:
        if not videos:
            return []
        videos_text = "\n\n".join(
            f"ID: {v['id']}\nTitle: {v['title']}\nDescription: {v['description'][:200]}"
            for v in videos
        )
        prompt = (
            f"AGENT SOUL:\n{soul}\n\n"
            f"VIDEOS TO SCREEN:\n{videos_text}\n\n"
            f"Which of these videos are relevant to the agent's soul and worth analyzing? "
            f"Respond with valid JSON only, no markdown fences:\n"
            f'{{\"relevant_ids\": [\"<id>\", ...]}}'
        )
        raw = self._generate(prompt)
        data = self._parse_result(raw)
        return data.get("relevant_ids", [])

    def reevaluate_knowledge(self, files: list[dict], soul: str) -> dict[str, float]:
        if not files:
            return {}
        files_text = "\n\n".join(
            f"--- {f['path']} ---\n{f['content']}" for f in files
        )
        contents = (
            f"AGENT SOUL:\n{soul}\n\n"
            f"TASK: Re-score each knowledge file below. Assign a relevance_score from 0.0 "
            f"(completely irrelevant to the soul's interests) to 1.0 (directly core to them).\n\n"
            f"{_REEVALUATE_SCHEMA}\n\n"
            f"KNOWLEDGE FILES:\n{files_text}"
        )
        data = self._parse_result(self._generate(contents, model=self._consolidation_model_name))
        return {item["path"]: float(item["score"]) for item in data.get("scores", [])}

    # -------------------------------------------------------------------------
    # Search-enabled generation (google_search tool)
    # NOTE: JSON response mode is incompatible with google_search — plain text only.
    # -------------------------------------------------------------------------

    @_api_retry
    def _generate_with_search(self, contents: str) -> str:
        """Generate with Gemini's built-in google_search tool enabled.
        NOTE: JSON response mode is incompatible with google_search — plain text only.
        """
        from google.genai import types as genai_types
        config = genai_types.GenerateContentConfig(
            tools=[genai_types.Tool(google_search=genai_types.GoogleSearch())],
            # response_mime_type intentionally NOT set — JSON mode forbidden with google_search
        )
        response = self._client.models.generate_content(
            model=self._consolidation_model_name,
            contents=contents,
            config=config,
        )
        return response.text

    def research_domain(
        self,
        soul: str,
        knowledge_index: str,
        existing_sources: str,
    ) -> tuple[list[ResearchFinding], list[DiscoveredSource]]:
        """Run an autonomous research session. Returns findings + discovered sources."""
        prompt = _RESEARCH_PROMPT_TEMPLATE.format(
            soul=soul,
            knowledge_index=knowledge_index or "(empty — first research session)",
            existing_sources=existing_sources,
        )
        text = self._generate_with_search(prompt)
        return self._parse_research_response(text)

    def validate_thesis(
        self,
        knowledge_files: list[dict],
        soul: str,
    ) -> ThesisValidationResult:
        """Search for counter-evidence against the top knowledge files."""
        lines = []
        for f in knowledge_files[:15]:
            path = f.get("path", "unknown")
            content = f.get("content", "")[:500]
            lines.append(f"### {path}\n{content}\n")
        files_text = "\n".join(lines)

        prompt = _VALIDATION_PROMPT_TEMPLATE.format(soul=soul, files_text=files_text)
        text = self._generate_with_search(prompt)
        return self._parse_validation_response(text)

    def suggest_soul_refinements(self, soul: str, knowledge_files: list[dict]) -> str:
        """Generate soul improvement suggestions based on what the agent has actually learned."""
        files_text = "\n\n".join(
            f"### {f['path']}\n{f['content'][:300]}" for f in knowledge_files
        )
        contents = (
            f"AGENT SOUL:\n{soul}\n\n"
            f"TOP KNOWLEDGE FILES (by effective_weight):\n{files_text}\n\n"
            f"Based on what this agent has actually learned versus what the SOUL specifies, "
            f"suggest up to 5 concrete improvements to the SOUL.md. "
            f"Focus on: (1) underrepresented topics worth adding, (2) noise signals to narrow or remove, "
            f"(3) new keywords or phrases that appear frequently but are not mentioned.\n\n"
            f"Output ONLY the suggestion sections — no introduction, no conclusion, no preamble. "
            f"Format each suggestion as a markdown section:\n\n"
            f"## [Short title for the improvement]\n\n"
            f"**Reasoning:** [1-2 sentences explaining why]\n\n"
            f"**Change:** [Exact text to add or remove from the SOUL]\n\n"
            f"Repeat for each suggestion."
        )
        return self._generate(contents, model=self._consolidation_model_name)

    def integrate_soul_suggestions(self, soul: str, suggestions: list[str]) -> str:
        suggestions_text = "\n\n---\n\n".join(suggestions)
        contents = (
            f"You are carefully revising an agent's SOUL.md by integrating specific improvements.\n\n"
            f"Rules:\n"
            f"- Preserve the existing soul's voice, structure, and core directives\n"
            f"- Integrate each suggestion naturally into the appropriate existing section — do not append at the end\n"
            f"- Only change what the suggestions specifically recommend; leave everything else intact\n"
            f"- Do not add unnecessary new sections or restructure unnecessarily\n"
            f"- Return ONLY the complete revised SOUL.md text, nothing else\n\n"
            f"CURRENT SOUL:\n{soul}\n\n"
            f"IMPROVEMENTS TO INTEGRATE:\n{suggestions_text}"
        )
        return self._generate(contents, model=self._consolidation_model_name)

    # -------------------------------------------------------------------------
    # Delimited block parsers (used by grounded/search-enabled methods)
    # -------------------------------------------------------------------------

    def _parse_delimited_blocks(self, text: str, start_marker: str, end_marker: str) -> list[str]:
        """Extract all text blocks between delimiters. Returns list of block contents."""
        blocks = []
        remaining = text
        while start_marker in remaining:
            _, _, after_start = remaining.partition(start_marker)
            block, sep, remaining = after_start.partition(end_marker)
            if not sep:
                break  # end marker not found — truncated response
            if block.strip():
                blocks.append(block.strip())
        return blocks

    def _parse_key_value_block(self, block: str) -> dict:
        """
        Parse a block like:
          TITLE: Some title
          SOURCES:
          - url1
          - url2
          INSIGHTS:
          - insight1
          SUMMARY:
          multi line
          text
        Returns dict with scalar keys and list keys (KEY_LIST for list sections).
        """
        result = {}
        lines = block.split("\n")
        current_key = None
        current_list = []
        in_list = False
        in_multiline = False
        multiline_buf = []

        LIST_SECTIONS = {"SOURCES", "INSIGHTS"}
        MULTILINE_SECTIONS = {"SUMMARY"}

        for line in lines:
            if ":" in line and not line.startswith("-") and not in_multiline:
                # Save previous
                if in_list and current_key:
                    result[f"{current_key}_LIST"] = current_list
                    current_list = []
                    in_list = False
                if in_multiline and current_key:
                    result[current_key] = "\n".join(multiline_buf).strip()
                    multiline_buf = []
                    in_multiline = False

                key, _, val = line.partition(":")
                key = key.strip()
                val = val.strip()
                current_key = key

                if key in LIST_SECTIONS:
                    in_list = True
                elif key in MULTILINE_SECTIONS:
                    in_multiline = True
                    if val:
                        multiline_buf.append(val)
                else:
                    result[key] = val
            elif in_list and line.startswith("- "):
                current_list.append(line[2:].strip())
            elif in_multiline:
                multiline_buf.append(line)

        # Flush final section
        if in_list and current_key:
            result[f"{current_key}_LIST"] = current_list
        if in_multiline and current_key:
            result[current_key] = "\n".join(multiline_buf).strip()

        return result

    def _parse_research_response(self, text: str) -> tuple[list[ResearchFinding], list[DiscoveredSource]]:
        """Parse delimited block format from a grounded research response."""
        from datetime import datetime, timezone
        findings = []
        sources = []

        for block in self._parse_delimited_blocks(text, "---FINDING_START---", "---FINDING_END---"):
            try:
                data = self._parse_key_value_block(block)
                findings.append(ResearchFinding(
                    title=data.get("TITLE", "Untitled"),
                    insights=data.get("INSIGHTS_LIST", []),
                    relevance_score=float(data.get("RELEVANCE", 0.5)),
                    suggested_action=data.get("ACTION", "new_concept"),
                    suggested_target=data.get("TARGET", "research-finding"),
                    raw_summary=data.get("SUMMARY", ""),
                    sources_consulted=data.get("SOURCES_LIST", []),
                ))
            except Exception as e:
                logger.warning(f"Skipping malformed FINDING block: {e}")

        for block in self._parse_delimited_blocks(text, "---SOURCE_START---", "---SOURCE_END---"):
            try:
                data = self._parse_key_value_block(block)
                handle = data.get("HANDLE", "NONE")
                sources.append(DiscoveredSource(
                    url=data.get("URL", ""),
                    source_type=data.get("TYPE", "website"),
                    handle=handle if handle != "NONE" else None,
                    rationale=data.get("RATIONALE", ""),
                    discovered_at=datetime.now(timezone.utc).isoformat(),
                ))
            except Exception as e:
                logger.warning(f"Skipping malformed SOURCE block: {e}")

        return findings, sources

    def _parse_validation_response(self, text: str) -> ThesisValidationResult:
        from datetime import datetime, timezone
        flagged = []
        for block in self._parse_delimited_blocks(text, "---FLAG_START---", "---FLAG_END---"):
            try:
                data = self._parse_key_value_block(block)
                flagged.append({
                    "path": data.get("PATH", ""),
                    "severity": data.get("SEVERITY", "low"),
                    "concern": data.get("CONCERN", ""),
                })
            except Exception as e:
                logger.warning(f"Skipping malformed FLAG block: {e}")

        # Extract VALIDATION_SUMMARY section
        summary = ""
        if "VALIDATION_SUMMARY:" in text:
            _, _, after = text.partition("VALIDATION_SUMMARY:")
            summary = after.strip()

        return ThesisValidationResult(
            flagged_files=flagged,
            validation_summary=summary,
            searched_at=datetime.now(timezone.utc).isoformat(),
        )

    def evaluate_skill(
        self, skill_content: str, test_prompts: list[str], soul: str
    ) -> SkillEvalResult:
        """Compare Gemini answers with vs. without the skill for each prompt, then grade the delta."""
        import hashlib
        from datetime import datetime, timezone

        skill_truncated = skill_content[:8000]

        # Collect bare answers (without skill context)
        bare_answers = []
        for prompt in test_prompts:
            answer = self._generate(prompt, model=self._consolidation_model_name)
            bare_answers.append(answer)

        # Collect skill-assisted answers (skill prepended as context)
        skill_answers = []
        for prompt in test_prompts:
            contents = (
                f"CONTEXT (domain knowledge skill):\n{skill_truncated}\n\n"
                f"Using the context above as additional domain knowledge, answer:\n{prompt}"
            )
            answer = self._generate(contents, model=self._consolidation_model_name)
            skill_answers.append(answer)

        # Single grader call: evaluate all prompt pairs
        pairs_text = ""
        for i, prompt in enumerate(test_prompts):
            pairs_text += (
                f"\n--- Prompt {i + 1} ---\n"
                f"QUESTION: {prompt}\n\n"
                f"ANSWER WITHOUT SKILL:\n{bare_answers[i][:1000]}\n\n"
                f"ANSWER WITH SKILL:\n{skill_answers[i][:1000]}\n"
            )

        grader_prompt = (
            f"AGENT SOUL (defines domain expectations):\n{soul}\n\n"
            f"SKILL CONTENT (first 2000 chars):\n{skill_truncated[:2000]}\n\n"
            f"TASK: For each prompt pair below, evaluate whether the skill provided meaningful "
            f"domain-specific depth or constraints BEYOND what the model could produce from "
            f"training alone. Score strictly:\n"
            f"- with_skill_score: 0.0-1.0 (quality of skill-assisted answer)\n"
            f"- without_skill_score: 0.0-1.0 (quality of bare answer)\n"
            f"- Penalize inflated scores — require cited evidence from the skill content.\n"
            f"- grader_reasoning: one sentence citing specific evidence from skill content\n\n"
            f"Respond with valid JSON only, no markdown fences:\n"
            f'{{"evaluations": [{{"prompt": "<prompt>", "with_skill_score": 0.0, '
            f'"without_skill_score": 0.0, "grader_reasoning": "<reasoning>"}}]}}\n\n'
            f"PROMPT PAIRS:{pairs_text}"
        )
        raw = self._generate(grader_prompt, model=self._consolidation_model_name)
        data = self._parse_result(raw)

        eval_results: list[PromptEvalResult] = []
        for item in data.get("evaluations", []):
            with_score = float(item.get("with_skill_score", 0.0))
            without_score = float(item.get("without_skill_score", 0.0))
            eval_results.append(PromptEvalResult(
                prompt=item.get("prompt", ""),
                with_skill_score=with_score,
                without_skill_score=without_score,
                delta=with_score - without_score,
                grader_reasoning=item.get("grader_reasoning", ""),
            ))

        overall_score = (
            sum(r.with_skill_score for r in eval_results) / len(eval_results)
            if eval_results else 0.0
        )
        skill_version = hashlib.md5(skill_content.encode()).hexdigest()[:8]

        return SkillEvalResult(
            score=overall_score,
            eval_results=eval_results,
            skill_version=skill_version,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    def stream_query(self, system_prompt: str, message: str, history: list[dict]):
        """Yields string tokens from a streaming Gemini chat."""
        from google.genai import types as gtypes

        contents = []
        for h in history:
            role = "user" if h.get("role") == "user" else "model"
            contents.append(gtypes.Content(role=role, parts=[gtypes.Part(text=h["content"])]))
        contents.append(gtypes.Content(role="user", parts=[gtypes.Part(text=message)]))

        response = self._client.models.generate_content_stream(
            model=self._consolidation_model_name,
            contents=contents,
            config=gtypes.GenerateContentConfig(system_instruction=system_prompt),
        )
        for chunk in response:
            if chunk.text:
                yield chunk.text
