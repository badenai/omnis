import json
import google.generativeai as genai
from core.models.types import AnalysisResult, ConsolidationResult

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
    def __init__(self, api_key: str, model_name: str = "gemini-1.5-pro"):
        genai.configure(api_key=api_key)
        self._model = genai.GenerativeModel(model_name)

    def _parse_result(self, raw: str) -> dict:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(text)

    def analyze_transcript(
        self, video_id: str, video_title: str, transcript: str, soul: str, prompt: str
    ) -> AnalysisResult:
        full_prompt = [
            f"AGENT SOUL:\n{soul}\n\nTASK:\n{prompt}\n\n{_ANALYSIS_SCHEMA}",
            f"VIDEO ID: {video_id}\nTITLE: {video_title}\n\nTRANSCRIPT:\n{transcript}",
        ]
        response = self._model.generate_content(full_prompt)
        data = self._parse_result(response.text)
        return AnalysisResult(**data)

    def analyze_video(
        self, video_id: str, video_title: str, video_url: str, soul: str, prompt: str
    ) -> AnalysisResult:
        full_prompt = [
            f"AGENT SOUL:\n{soul}\n\nTASK:\n{prompt}\n\n{_ANALYSIS_SCHEMA}",
            f"VIDEO ID: {video_id}\nTITLE: {video_title}\nURL: {video_url}",
            {"file_data": {"mime_type": "video/*", "file_uri": video_url}},
        ]
        response = self._model.generate_content(full_prompt)
        data = self._parse_result(response.text)
        return AnalysisResult(**data)

    def generate_briefing(self, knowledge_files: list[dict], soul: str, mode: str) -> str:
        files_text = "\n\n---\n\n".join(
            f"# {f['path']}\n{f['content']}" for f in knowledge_files
        )
        prompt = f"""AGENT SOUL:\n{soul}

Mode: {mode}

Based on the following knowledge files (sorted by effective_weight descending),
write a comprehensive briefing document in Markdown. Structure:
- For 'accumulate': Core Concepts -> Strategies -> Implementation Guidance
- For 'watch': Recent Developments -> Trends -> Opportunity Suggestions

KNOWLEDGE FILES:
{files_text}"""
        response = self._model.generate_content(prompt)
        return response.text

    def generate_skill(self, briefing: str, soul: str, agent_id: str) -> str:
        prompt = f"""AGENT SOUL:\n{soul}

Convert the following briefing into a Claude Code SKILL.md file.
The skill should have YAML frontmatter with name, description, last_updated fields.
The body should be structured as a knowledge injection prompt - concise, actionable,
ready to be used as context for an implementation agent.

BRIEFING:
{briefing}"""
        response = self._model.generate_content(prompt)
        return response.text

    def consolidate(
        self, inbox_items: list[str], existing_index: str, soul: str
    ) -> ConsolidationResult:
        inbox_text = "\n\n---\n\n".join(inbox_items)
        prompt = f"""AGENT SOUL:\n{soul}

EXISTING KNOWLEDGE INDEX:
{existing_index}

NEW INBOX ITEMS:
{inbox_text}

For each inbox item, decide:
1. Does it update an existing concept? (suggested_action: update_concept, target: filename)
2. Is it a genuinely new concept? (new_concept, target: filename-hint)
3. Is it time-sensitive news? (new_recent, target: filename-hint)

Respond with JSON only:
{{
  "decisions": [
    {{"inbox_index": 0, "action": "update_concept", "target": "support-resistance"}},
    ...
  ]
}}"""
        response = self._model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        data = json.loads(text)
        return ConsolidationResult(updated_files=[], created_files=[], errors=[])
