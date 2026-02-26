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

export interface AgentSummary {
  agent_id: string;
  mode: string;
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
  mode: string;
  model: string;
  analysis_mode: string;
  sources: { youtube_channels?: ChannelSource[] };
  consolidation_schedule: string;
  decay: { half_life_days: number };
  soul: string;
  last_checked: Record<string, string>;
  last_consolidation: string | null;
  inbox_count: number;
  knowledge_count: number;
}

export interface AgentConfigCreate {
  agent_id: string;
  mode: string;
  model: string;
  analysis_mode: string;
  sources: AgentSources;
  consolidation_schedule: string;
  decay: AgentDecay;
  soul: string;
}

export interface AgentConfigUpdate {
  mode?: string;
  model?: string;
  analysis_mode?: string;
  sources?: AgentSources;
  consolidation_schedule?: string;
  decay?: AgentDecay;
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
