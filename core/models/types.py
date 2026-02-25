from dataclasses import dataclass, field


@dataclass
class AnalysisResult:
    video_id: str
    video_title: str
    insights: list[str]
    relevance_score: float
    suggested_action: str          # "update_concept" | "new_concept" | "new_recent"
    suggested_target: str          # filename hint (without extension)
    raw_summary: str


@dataclass
class ConsolidationResult:
    updated_files: list[str]
    created_files: list[str]
    errors: list[str] = field(default_factory=list)


@dataclass
class AgentConfig:
    agent_id: str
    mode: str                      # "accumulate" | "watch"
    model: str                     # "gemini" | "openai" | "claude"
    analysis_mode: str             # "full_video" | "transcript_only"
    sources: dict
    consolidation_schedule: str
    decay: dict
