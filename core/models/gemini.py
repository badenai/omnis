import json
import logging
from google import genai
from core.models.types import AnalysisResult, ConsolidationResult, ConsolidationDecision

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


class GeminiProvider:
    def __init__(self, api_key: str, model_name: str = "gemini-2.5-flash"):
        self._client = genai.Client(api_key=api_key)
        self._model_name = model_name

    def _generate(self, contents: str | list) -> str:
        response = self._client.models.generate_content(
            model=self._model_name,
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
        return self._generate(contents)

    def generate_skill(self, briefing: str, soul: str, agent_id: str) -> str:
        contents = (
            f"AGENT SOUL:\n{soul}\n\n"
            f"Convert the following briefing into a Claude Code SKILL.md file. "
            f"The skill should have YAML frontmatter with name, description, last_updated fields. "
            f"The body should be structured as a knowledge injection prompt - concise, actionable, "
            f"ready to be used as context for an implementation agent.\n\n"
            f"BRIEFING:\n{briefing}"
        )
        return self._generate(contents)

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
        raw = self._generate(contents)
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
