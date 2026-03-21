from typing import Protocol, TYPE_CHECKING
from core.models.types import AnalysisResult, ConsolidationResult
if TYPE_CHECKING:
    from core.models.types import SkillEvalResult, PluginOutput


class KnowledgeProvider(Protocol):
    def analyze_transcript(
        self, video_id: str, video_title: str, transcript: str, soul: str, prompt: str
    ) -> AnalysisResult: ...

    def analyze_video(
        self, video_id: str, video_title: str, video_url: str, soul: str, prompt: str
    ) -> AnalysisResult: ...

    def generate_digest(self, knowledge_files: list[dict], soul: str) -> str: ...

    def generate_skill(self, digest: str, soul: str, agent_id: str) -> str: ...

    def generate_plugin_skills(
        self, digest: str, soul: str, agent_id: str,
        learnings: str | None = None,
        existing_clusters: list[str] | None = None,
    ) -> "PluginOutput": ...

    def consolidate(
        self, inbox_items: list[str], existing_index: str, soul: str
    ) -> ConsolidationResult: ...

    def evaluate_skill(
        self, skill_content: str, test_prompts: list[str], soul: str,
        bare_answers: list[str] | None = None,
    ) -> "SkillEvalResult": ...

    def compute_bare_answers(self, test_prompts: list[str]) -> list[str]: ...

    def integrate_soul_suggestions(self, soul: str, suggestions: list[str]) -> str: ...

    def integrate_and_generate_skill(
        self, soul: str, suggestion: str, digest: str, agent_id: str,
        learnings: str | None = None,
    ) -> tuple[str, str]: ...

    def stream_query(
        self,
        system_prompt: str,
        message: str,
        history: list[dict],
        tool_declarations: list,
        tool_handlers: dict,
    ):
        """Yields string tokens. history items: {"role": "user"|"model", "content": str}"""
        ...
