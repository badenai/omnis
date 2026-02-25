from typing import Protocol
from core.models.types import AnalysisResult, ConsolidationResult


class KnowledgeProvider(Protocol):
    def analyze_transcript(
        self, video_id: str, video_title: str, transcript: str, soul: str, prompt: str
    ) -> AnalysisResult: ...

    def analyze_video(
        self, video_id: str, video_title: str, video_url: str, soul: str, prompt: str
    ) -> AnalysisResult: ...

    def generate_briefing(self, knowledge_files: list[dict], soul: str, mode: str) -> str: ...

    def generate_skill(self, briefing: str, soul: str, agent_id: str) -> str: ...

    def consolidate(
        self, inbox_items: list[str], existing_index: str, soul: str
    ) -> ConsolidationResult: ...
