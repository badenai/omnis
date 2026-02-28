import json
import logging
from google import genai
from core.models.types import (
    AnalysisResult, ConsolidationResult, ConsolidationDecision,
    ResearchFinding, DiscoveredSource, ThesisValidationResult,
)

logger = logging.getLogger(__name__)

_ANALYSIS_SCHEMA = """
Respond with valid JSON only, no markdown fences:
{
  "video_id": "<id>",
  "video_title": "<title>",
  "insights": ["<insight>", ...],
  "relevance_score": <0.0-1.0>,
  "suggested_action": "<update_concept|new_concept|new_recent>",
  "suggested_target": "<filename-hint-no-extension>",
  "raw_summary": "<full summary>"
}
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

    def _generate(self, contents: str | list, model: str | None = None) -> str:
        response = self._client.models.generate_content(
            model=model or self._model_name,
            contents=contents,
        )
        return response.text

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

    def analyze_transcript(
        self, video_id: str, video_title: str, transcript: str, soul: str, prompt: str
    ) -> AnalysisResult:
        contents = (
            f"AGENT SOUL:\n{soul}\n\nTASK:\n{prompt}\n\n{_ANALYSIS_SCHEMA}\n\n"
            f"VIDEO ID: {video_id}\nTITLE: {video_title}\n\nTRANSCRIPT:\n{transcript}"
        )
        data = self._parse_result(self._generate(contents))
        return AnalysisResult(**data)

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
        return AnalysisResult(**data)

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
        return AnalysisResult(**self._parse_result(raw))

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
        return AnalysisResult(**self._parse_result(response.text))

    def generate_briefing(self, knowledge_files: list[dict], soul: str, mode: str) -> str:
        files_text = "\n\n---\n\n".join(
            f"# {f['path']}\n{f['content']}" for f in knowledge_files
        )
        contents = (
            f"AGENT SOUL:\n{soul}\n\nMode: {mode}\n\n"
            f"Based on the following knowledge files (sorted by effective_weight descending), "
            f"write a comprehensive briefing document in Markdown. Structure:\n"
            f"- For 'accumulate': Core Concepts -> Strategies -> Implementation Guidance\n"
            f"- For 'watch': Recent Developments -> Trends -> Opportunity Suggestions\n\n"
            f"KNOWLEDGE FILES:\n{files_text}"
        )
        return self._generate(contents, model=self._consolidation_model_name)

    def generate_skill(self, briefing: str, soul: str, agent_id: str) -> str:
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
            f"   description: <one sentence — what situation triggers this skill>\n"
            f"   last_updated: {today}\n\n"
            f"2. ## Overview\n"
            f"   One-sentence core principle. Then announce line:\n"
            f"   'Announce at start: I am using the {agent_id} skill.'\n\n"
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
            f"KNOWLEDGE BRIEFING (extract behavioral rules from this — do not summarize it):\n"
            f"{briefing}"
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
