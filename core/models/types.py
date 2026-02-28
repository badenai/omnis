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
class ConsolidationDecision:
    inbox_index: int
    action: str   # "update_concept" | "new_concept" | "new_recent"
    target: str   # filename hint (no extension)


@dataclass
class ConsolidationResult:
    updated_files: list[str]
    created_files: list[str]
    decisions: list = field(default_factory=list)   # list[ConsolidationDecision]
    errors: list[str] = field(default_factory=list)


@dataclass
class ResearchFinding:
    title: str
    insights: list[str]
    relevance_score: float
    suggested_action: str        # "update_concept" | "new_concept" | "new_recent"
    suggested_target: str        # kebab-case filename hint
    raw_summary: str
    sources_consulted: list[str]


@dataclass
class DiscoveredSource:
    url: str
    source_type: str             # "youtube_channel" | "blog" | "website" | "podcast"
    handle: str | None
    rationale: str
    discovered_at: str           # ISO timestamp


@dataclass
class ThesisValidationResult:
    flagged_files: list[dict]    # Each: {"path": str, "concern": str, "severity": str}
    validation_summary: str
    searched_at: str


@dataclass
class AgentConfig:
    agent_id: str
    model: str                     # "gemini" | "openai" | "claude"
    analysis_mode: str             # "full_video" | "transcript_only"
    sources: dict
    consolidation_schedule: str
    decay: dict
    collection_model: str = "gemini-3-flash-preview"
    consolidation_model: str = "gemini-3.1-pro-preview"
    research: dict = field(default_factory=dict)
    reflect_immediately: bool = False
    # Shape: {"enabled": bool, "schedule": "cron string"}
