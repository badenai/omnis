export interface ChannelSource {
  handle: string;
}

export interface AgentSources {
  youtube_channels: ChannelSource[];
}

export interface AgentDecay {
  half_life_days: number;
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
  self_improving: boolean;
}

export interface SourceStats {
  scores: number[];
  credibility_flags: { hype_pattern: number; unverified_claims: number };
  status: 'active' | 'paused' | 'flagged';
  flagged_reason: string | null;
  flagged_at: string | null;
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
  self_improving: boolean;
  last_checked: Record<string, string>;
  last_consolidation: string | null;
  inbox_count: number;
  knowledge_count: number;
  source_stats: Record<string, SourceStats>;
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
  self_improving: boolean;
}

export interface AgentConfigUpdate {
  model?: string;
  analysis_mode?: string;
  sources?: AgentSources;
  consolidation_schedule?: string;
  decay?: AgentDecay;
  collection_model?: string;
  consolidation_model?: string;
  self_improving?: boolean;
}

export interface JobInfo {
  id: string;
  name: string;
  next_run_time: string | null;
}

export interface LogEntry {
  ts: string;
  msg: string;
}

export interface KnowledgeFile {
  path: string;
  effective_weight: number;
  metadata: Record<string, unknown>;
}

export interface KnowledgeFileContent extends KnowledgeFile {
  content: string;
}
