from pydantic import BaseModel


class ChannelSource(BaseModel):
    handle: str
    check_schedule: str = "0 8 * * *"


class AgentSources(BaseModel):
    youtube_channels: list[ChannelSource] = []


class AgentDecay(BaseModel):
    half_life_days: int = 365


class AgentConfigCreate(BaseModel):
    agent_id: str
    mode: str = "accumulate"
    model: str = "gemini"
    analysis_mode: str = "transcript_only"
    sources: AgentSources = AgentSources()
    consolidation_schedule: str = "0 3 * * 0"
    decay: AgentDecay = AgentDecay()
    soul: str = ""


class AgentConfigUpdate(BaseModel):
    mode: str | None = None
    model: str | None = None
    analysis_mode: str | None = None
    sources: AgentSources | None = None
    consolidation_schedule: str | None = None
    decay: AgentDecay | None = None


class SoulUpdate(BaseModel):
    soul: str


class AgentSummary(BaseModel):
    agent_id: str
    mode: str
    model: str
    analysis_mode: str
    consolidation_schedule: str
    channel_count: int
    last_consolidation: str | None = None
    inbox_count: int = 0
    knowledge_count: int = 0


class AgentDetail(BaseModel):
    agent_id: str
    mode: str
    model: str
    analysis_mode: str
    sources: dict
    consolidation_schedule: str
    decay: dict
    soul: str
    last_checked: dict = {}
    last_consolidation: str | None = None
    inbox_count: int = 0
    knowledge_count: int = 0


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
