from pydantic import BaseModel


class ChannelSource(BaseModel):
    handle: str


class AgentSources(BaseModel):
    youtube_channels: list[ChannelSource] = []


class AgentDecay(BaseModel):
    half_life_days: int = 365


class AgentConfigCreate(BaseModel):
    agent_id: str
    model: str = "gemini"
    analysis_mode: str = "transcript_only"
    sources: AgentSources = AgentSources()
    consolidation_schedule: str = "0 3 * * 0"
    decay: AgentDecay = AgentDecay()
    collection_model: str = "gemini-3-flash-preview"
    consolidation_model: str = "gemini-3.1-pro-preview"
    soul: str = ""
    self_improving: bool = True


class AgentConfigUpdate(BaseModel):
    model: str | None = None
    analysis_mode: str | None = None
    sources: AgentSources | None = None
    consolidation_schedule: str | None = None
    decay: AgentDecay | None = None
    collection_model: str | None = None
    consolidation_model: str | None = None
    self_improving: bool | None = None


class SoulUpdate(BaseModel):
    soul: str


class AgentSummary(BaseModel):
    agent_id: str
    model: str
    analysis_mode: str
    consolidation_schedule: str
    channel_count: int
    last_consolidation: str | None = None
    inbox_count: int = 0
    knowledge_count: int = 0
    self_improving: bool = True


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
    sources: dict
    consolidation_schedule: str
    decay: dict
    collection_model: str
    consolidation_model: str
    soul: str
    self_improving: bool = True
    last_checked: dict = {}
    last_consolidation: str | None = None
    inbox_count: int = 0
    knowledge_count: int = 0
    source_stats: dict[str, SourceStats] = {}


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
