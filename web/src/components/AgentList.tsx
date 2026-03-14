import { Link } from 'react-router-dom';
import { useAgents } from '../api/agents';
import { useActivity } from '../api/scheduler';

type AgentStatus = 'running' | 'attention' | 'quality-alert' | 'ok' | 'idle';

function agentStatus(
  agentId: string,
  inboxCount: number,
  lastConsolidation: string | null | undefined,
  activeAgentIds: Set<string>,
  qualityAlert: boolean,
): AgentStatus {
  if (activeAgentIds.has(agentId)) return 'running';
  if (inboxCount > 0) return 'attention';
  if (qualityAlert) return 'quality-alert';
  if (!lastConsolidation) return 'idle';
  return 'ok';
}

const statusConfig: Record<AgentStatus, { color: string; label: string }> = {
  running: { color: 'var(--color-status-active)', label: 'Running' },
  attention: { color: 'var(--color-status-warn)', label: 'Attention' },
  'quality-alert': { color: 'var(--color-status-error)', label: 'Quality Alert' },
  ok: { color: 'var(--color-status-ok)', label: 'OK' },
  idle: { color: 'var(--color-status-idle)', label: 'Idle' },
};

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)' }}
    >
      <div
        className="text-[9px] uppercase tracking-[0.1em] mb-1"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
      >
        {label}
      </div>
      <div
        className="text-2xl font-medium leading-none"
        style={{ fontFamily: 'var(--font-mono)', color: accent ?? 'var(--color-text-primary)' }}
      >
        {value}
      </div>
    </div>
  );
}

export default function AgentList() {
  const { data: agents, isLoading, error } = useAgents();
  const { data: activityData } = useActivity();

  const activeAgentIds = new Set(
    (activityData?.active ?? []).map((j) => j.agent_id)
  );

  if (isLoading) return (
    <div className="flex items-center justify-center h-64" style={{ color: 'var(--color-text-muted)' }}>
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-5 h-5 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--color-accent-dim)', borderTopColor: 'var(--color-accent)' }}
        />
        <p className="text-sm">Loading agents...</p>
      </div>
    </div>
  );

  if (error) return (
    <div
      className="p-4 rounded-lg text-sm"
      style={{ color: 'var(--color-status-error)', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
    >
      Error: {(error as Error).message}
    </div>
  );

  const agentList = agents ?? [];
  const needsAttention = agentList.filter((a) => a.inbox_count > 0).length;
  const qualityAlerts = agentList.filter((a) => a.quality_alert).length;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 32 }}>
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            Knowledge Agents
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            Monitor and manage your specialized AI agents.
          </p>
        </div>
        <Link
          to="/agents/new"
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent-dim)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent)')}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Deploy Agent
        </Link>
      </div>

      {/* Stats row */}
      {agentList.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total Agents" value={agentList.length} />
          <StatCard label="Active Tasks" value={activeAgentIds.size} accent={activeAgentIds.size > 0 ? 'var(--color-status-active)' : undefined} />
          <StatCard label="Needs Attention" value={needsAttention} accent={needsAttention > 0 ? 'var(--color-status-warn)' : undefined} />
          <StatCard label="Quality Alerts" value={qualityAlerts} accent={qualityAlerts > 0 ? 'var(--color-status-error)' : undefined} />
        </div>
      )}

      {/* Section divider */}
      {agentList.length > 0 && (
        <div className="flex items-center gap-3">
          <span
            className="text-[10px] uppercase tracking-[0.1em]"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
          >
            All Agents [{agentList.length}]
          </span>
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
        </div>
      )}

      {/* Empty state */}
      {!agentList.length ? (
        <div
          className="flex flex-col items-center justify-center p-16 text-center rounded-lg"
          style={{ border: '1px dashed var(--color-border-default)', backgroundColor: 'var(--color-surface-1)' }}
        >
          <div
            className="w-11 h-11 rounded-lg flex items-center justify-center mb-4"
            style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-default)' }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-text-muted)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>No agents deployed</h3>
          <p className="text-sm max-w-sm mb-5" style={{ color: 'var(--color-text-muted)' }}>
            Create your first intelligence agent to begin gathering and synthesizing knowledge.
          </p>
          <Link
            to="/agents/new"
            className="text-sm font-medium flex items-center gap-1 transition-colors"
            style={{ color: 'var(--color-accent)' }}
          >
            Create Agent <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : (
        /* Agent grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agentList.map((a) => {
            const status = agentStatus(a.agent_id, a.inbox_count, a.last_consolidation, activeAgentIds, a.quality_alert);
            const sc = statusConfig[status];
            return (
              <Link
                key={a.agent_id}
                to={`/agents/${a.agent_id}`}
                className="group flex flex-col rounded-xl overflow-hidden transition-all duration-150"
                style={{
                  backgroundColor: 'var(--color-surface-1)',
                  border: '1px solid var(--color-border-subtle)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-subtle)')}
              >
                {/* Card header */}
                <div className="p-4 flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--color-accent-glow)', border: '1px solid var(--color-accent-dim)' }}
                    >
                      <span
                        className="text-sm font-semibold uppercase"
                        style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}
                      >
                        {a.agent_id.substring(0, 1)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {a.agent_id}
                      </div>
                      <div
                        className="text-[10px] truncate mt-0.5"
                        style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}
                      >
                        {a.model}
                      </div>
                    </div>
                  </div>

                  {/* Status indicator */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${status === 'running' ? 'animate-pulse' : ''}`}
                      style={{ backgroundColor: sc.color }}
                    />
                    <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: sc.color }}>
                      {sc.label}
                    </span>
                  </div>
                </div>

                {/* Metrics strip */}
                <div
                  className="grid grid-cols-4 divide-x"
                  style={{ backgroundColor: 'var(--color-surface-2)', borderTop: '1px solid var(--color-border-subtle)', borderColor: 'var(--color-border-subtle)' }}
                >
                  {[
                    { label: 'Inbox', value: a.inbox_count, warn: a.inbox_count > 0 },
                    { label: 'Knowledge', value: a.knowledge_count, warn: false },
                    { label: 'Sources', value: a.source_count, warn: false },
                    {
                      label: 'Quality',
                      value: a.latest_quality_score != null ? a.latest_quality_score.toFixed(2) : '—',
                      warn: a.quality_alert,
                    },
                  ].map(({ label, value, warn }) => (
                    <div
                      key={label}
                      className="flex flex-col items-center py-3"
                      style={{ borderColor: 'var(--color-border-subtle)' }}
                    >
                      <div
                        className="text-[8px] uppercase tracking-[0.1em] mb-1"
                        style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
                      >
                        {label}
                      </div>
                      <span
                        className="text-lg font-medium leading-none"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: warn ? 'var(--color-status-warn)' : 'var(--color-text-primary)',
                        }}
                      >
                        {value}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Card footer */}
                <div
                  className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderTop: '1px solid var(--color-border-subtle)' }}
                >
                  <span
                    className="text-[10px]"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
                  >
                    {a.last_consolidation
                      ? `Synced ${new Date(a.last_consolidation).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                      : 'Never synced'}
                  </span>
                  <svg
                    className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}
