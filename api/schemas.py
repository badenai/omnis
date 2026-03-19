import re

from pydantic import BaseModel, field_validator


class SkillEvalConfig(BaseModel):
    prompts: list[str] = []
    min_quality_threshold: float = 0.6
    enabled: bool = True


class AgentDecay(BaseModel):
    half_life_days: int = 365


class AgentConfigCreate(BaseModel):
    agent_id: str
    model: str = "gemini"

    @field_validator("agent_id")
    @classmethod
    def validate_agent_id(cls, v: str) -> str:
        if not re.match(r"^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$", v):
            raise ValueError("agent_id must contain only lowercase letters, digits, and hyphens, and cannot start or end with a hyphen")
        return v
    analysis_mode: str = "transcript_only"
    sources: list[dict] = []
    consolidation_schedule: str = "0 3 * * 0"
    decay: AgentDecay = AgentDecay()
    collection_model: str = "gemini-3-flash-preview"
    consolidation_model: str = "gemini-3.1-pro-preview"
    soul: str = ""
    self_improving: bool = True
    skill_eval: SkillEvalConfig = SkillEvalConfig()


class AgentConfigUpdate(BaseModel):
    model: str | None = None
    analysis_mode: str | None = None
    sources: list[dict] | None = None
    consolidation_schedule: str | None = None
    decay: AgentDecay | None = None
    collection_model: str | None = None
    consolidation_model: str | None = None
    self_improving: bool | None = None
    skill_eval: SkillEvalConfig | None = None
    paused: bool | None = None


class SoulUpdate(BaseModel):
    soul: str


class AgentSummary(BaseModel):
    agent_id: str
    model: str
    analysis_mode: str
    consolidation_schedule: str
    source_count: int
    last_consolidation: str | None = None
    inbox_count: int = 0
    knowledge_count: int = 0
    self_improving: bool = True
    latest_quality_score: float | None = None
    quality_alert: bool = False
    paused: bool = False


class SourceStats(BaseModel):
    scores: list[float] = []
    credibility_flags: dict = {}
    status: str = "active"
    flagged_reason: str | None = None
    flagged_at: str | None = None


class AgentDetail(BaseModel):
    agent_id: str
    model: str
    analysis_mode: str
    sources: list[dict]
    consolidation_schedule: str
    decay: dict
    collection_model: str
    consolidation_model: str
    soul: str
    self_improving: bool = True
    skill_eval: SkillEvalConfig = SkillEvalConfig()
    last_checked: dict = {}
    last_consolidation: str | None = None
    inbox_count: int = 0
    knowledge_count: int = 0
    source_stats: dict[str, SourceStats] = {}
    latest_quality_score: float | None = None
    quality_alert: bool = False
    has_soul_backup: bool = False
    paused: bool = False


class SoulIntegrateRequest(BaseModel):
    soul: str
    suggestions: list[str]


class SoulPreviewEvalRequest(BaseModel):
    soul: str


class IngestUrlRequest(BaseModel):
    url: str
    title: str | None = None


class IngestChannelExecuteRequest(BaseModel):
    url: str
    limit: int | None = None


class JobInfo(BaseModel):
    id: str
    name: str
    next_run_time: str | None = None


class KnowledgeFile(BaseModel):
    path: str
    effective_weight: float
    metadata: dict


class KnowledgeFileContent(BaseModel):
    path: str
    content: str
    effective_weight: float
    metadata: dict
