export interface SkillEvalConfig {
  prompts: string[];
  min_quality_threshold: number;
  enabled: boolean;
}

export interface PromptEvalResult {
  prompt: string;
  with_skill_score: number;
  without_skill_score: number;
  delta: number;
  grader_reasoning: string;
}

export interface QualityHistoryEntry {
  score: number;
  skill_version: string;
  timestamp: string;
  eval_results: PromptEvalResult[];
  rollback?: boolean;
}

export interface QualityHistory {
  history: QualityHistoryEntry[];
  latest_score: number | null;
  alert: boolean;
}

export interface StructureIssue {
  severity: 'warning' | 'error';
  criterion: string;
  section?: string;
  issue: string;
  suggestion: string;
}

export interface SkillAudit {
  timestamp: string;
  line_count: number;
  overall_score: number;
  issues: StructureIssue[];
  summary: string;
}

export interface AgentDecay {
  half_life_days: number;
}

export interface AgentSummary {
  agent_id: string;
  model: string;
  analysis_mode: string;
  consolidation_schedule: string;
  source_count: number;
  last_consolidation: string | null;
  inbox_count: number;
  knowledge_count: number;
  self_improving: boolean;
  latest_quality_score: number | null;
  quality_alert: boolean;
  paused: boolean;
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
  sources: Array<{ type: string; [key: string]: unknown }>;
  consolidation_schedule: string;
  decay: { half_life_days: number };
  collection_model: string;
  consolidation_model: string;
  soul: string;
  self_improving: boolean;
  skill_eval: SkillEvalConfig;
  plugin_version: string | null;
  last_checked: Record<string, string>;
  last_consolidation: string | null;
  inbox_count: number;
  knowledge_count: number;
  source_stats: Record<string, SourceStats>;
  latest_quality_score: number | null;
  quality_alert: boolean;
  has_soul_backup: boolean;
  paused: boolean;
}

export interface AgentConfigCreate {
  agent_id: string;
  model: string;
  analysis_mode: string;
  sources: Array<{ type: string; [key: string]: unknown }>;
  consolidation_schedule: string;
  decay: AgentDecay;
  collection_model: string;
  consolidation_model: string;
  soul: string;
  self_improving: boolean;
  plugin_version?: string | null;
  skill_eval?: SkillEvalConfig;
}

export interface AgentConfigUpdate {
  model?: string;
  analysis_mode?: string;
  sources?: Array<{ type: string; [key: string]: unknown }>;
  consolidation_schedule?: string;
  decay?: AgentDecay;
  collection_model?: string;
  consolidation_model?: string;
  self_improving?: boolean;
  plugin_version?: string | null;
  skill_eval?: SkillEvalConfig;
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

export interface PluginSkill {
  name: string;
  description: string;
  file_pattern: string | null;
  bash_pattern: string | null;
  content: string;
}
