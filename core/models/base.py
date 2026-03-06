from typing import Protocol, TYPE_CHECKING
from core.models.types import AnalysisResult, ConsolidationResult
if TYPE_CHECKING:
    from core.models.types import SkillEvalResult


class KnowledgeProvider(Protocol):
    def analyze_transcript(
        self, video_id: str, video_title: str, transcript: str, soul: str, prompt: str
    ) -> AnalysisResult: ...

    def analyze_video(
        self, video_id: str, video_title: str, video_url: str, soul: str, prompt: str
    ) -> AnalysisResult: ...

    def generate_digest(self, knowledge_files: list[dict], soul: str) -> str: ...

    def generate_skill(self, digest: str, soul: str, agent_id: str) -> str: ...

    def consolidate(
        self, inbox_items: list[str], existing_index: str, soul: str
    ) -> ConsolidationResult: ...

    def evaluate_skill(
        self, skill_content: str, test_prompts: list[str], soul: str
    ) -> "SkillEvalResult": ...

    def integrate_soul_suggestions(self, soul: str, suggestions: list[str]) -> str: ...

    def stream_query(
        self, system_prompt: str, message: str, history: list[dict]
    ):
        """Yields string tokens. history items: {"role": "user"|"model", "content": str}"""
        ...
