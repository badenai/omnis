export interface ChannelSource {
  handle: string;
  check_schedule: string;
}

export interface AgentSources {
  youtube_channels: ChannelSource[];
}

export interface AgentDecay {
  half_life_days: number;
}

export interface AgentResearch {
  enabled: boolean;
  schedule: string;
}

export interface AgentSummary {
  agent_id: string;
  model: string;
  analysis_mode: string;
  consolidation_schedule: string;
  channel_count: number;
  last_consolidation: string | null;
  inbox_count: number;
  knowledge_count: number;
}

export interface AgentDetail {
  agent_id: string;
  model: string;
  analysis_mode: string;
  sources: { youtube_channels?: ChannelSource[] };
  consolidation_schedule: string;
  decay: { half_life_days: number };
  collection_model: string;
  consolidation_model: string;
  soul: string;
  research?: AgentResearch;
  last_checked: Record<string, string>;
  last_consolidation: string | null;
  inbox_count: number;
  knowledge_count: number;
}

export interface AgentConfigCreate {
  agent_id: string;
  model: string;
  analysis_mode: string;
  sources: AgentSources;
  consolidation_schedule: string;
  decay: AgentDecay;
  collection_model: string;
  consolidation_model: string;
  soul: string;
  research?: AgentResearch;
}

export interface AgentConfigUpdate {
  model?: string;
  analysis_mode?: string;
  sources?: AgentSources;
  consolidation_schedule?: string;
  decay?: AgentDecay;
  collection_model?: string;
  consolidation_model?: string;
  research?: AgentResearch;
}

export interface JobInfo {
  id: string;
  name: string;
  next_run_time: string | null;
}

export interface KnowledgeFile {
  path: string;
  effective_weight: number;
  metadata: Record<string, unknown>;
}

export interface KnowledgeFileContent extends KnowledgeFile {
  content: string;
}
