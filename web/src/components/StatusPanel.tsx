import { useState } from 'react';
import {
  useTriggerCollection, useTriggerRun, useTriggerReevaluation,
  useDiscoveredSources, useTriggerFactCheck, useResetSourceStatus,
} from '../api/scheduler';
import { useJobs } from '../api/scheduler';
import type { AgentDetail, SourceStats } from '../types';
import Tooltip from './Tooltip';

interface Props {
  agent: AgentDetail;
  onOpenInbox?: () => void;
}

export default function StatusPanel({ agent, onOpenInbox }: Props) {
  const { data: jobs } = useJobs();
  const triggerCollection = useTriggerCollection(agent.agent_id);
  const triggerRun = useTriggerRun(agent.agent_id);
  const triggerReevaluation = useTriggerReevaluation(agent.agent_id);
  const triggerFactCheck = useTriggerFactCheck(agent.agent_id);
  const resetSourceStatus = useResetSourceStatus(agent.agent_id);
  const { data: discoveredSources } = useDiscoveredSources(agent.agent_id);
  const [message, setMessage] = useState('');

  const agentJobs = jobs?.filter((j) => j.id.startsWith(agent.agent_id)) ?? [];
  const channels = agent.sources.youtube_channels ?? [];

  const handleCollect = async (handle: string) => {
    setMessage('');
    try {
      await triggerCollection.mutateAsync(handle);
      setMessage(`Triggered collection for ${handle}`);
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    }
  };

  const handleRun = async () => {
    setMessage('');
    try {
      await triggerRun.mutateAsync();
      setMessage('Triggered full run');
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    }
  };

  const handleReevaluate = async () => {
    setMessage('');
    try {
      await triggerReevaluation.mutateAsync();
      setMessage('Triggered reevaluation');
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    }
  };

  const handleFactCheck = async (sourceId: string) => {
    setMessage('');
    try {
      await triggerFactCheck.mutateAsync(sourceId);
      setMessage(`Triggered fact-check for ${sourceId}`);
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    }
  };

  const handleResetSource = async (sourceId: string) => {
    setMessage('');
    try {
      await resetSourceStatus.mutateAsync(sourceId);
      setMessage(`Reactivated ${sourceId}`);
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    }
  };

  const sourceStatusBadge = (stats: SourceStats | undefined) => {
    if (!stats || stats.status === 'active') return null;
    const isPaused = stats.status === 'paused';
    const color = isPaused ? 'var(--color-status-warn)' : 'var(--color-status-error)';
    const bg = isPaused ? 'rgba(234,179,8,0.12)' : 'rgba(239,68,68,0.12)';
    const border = isPaused ? 'rgba(234,179,8,0.3)' : 'rgba(239,68,68,0.3)';
    const label = isPaused ? '⏸ paused' : '⚠ flagged';
    const title = stats.flagged_reason ?? '';
    return (
      <span
        title={title}
        style={{
          fontSize: '10px', fontFamily: 'var(--font-mono)', padding: '2px 6px',
          borderRadius: '4px', color, backgroundColor: bg, border: `1px solid ${border}`,
          marginLeft: '6px', cursor: 'default',
        }}
      >
        {label}
      </span>
    );
  };

  const monoLabel: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--color-text-muted)',
    marginBottom: '4px',
  };

  return (
    <div className="space-y-5">
      {message && (
        <div
          className="px-3 py-2 rounded-lg text-sm"
          style={
            message.startsWith('Error')
              ? { backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--color-status-error)', border: '1px solid rgba(239,68,68,0.2)' }
              : { backgroundColor: 'rgba(34,197,94,0.1)', color: 'var(--color-status-ok)', border: '1px solid rgba(34,197,94,0.2)' }
          }
        >
          {message}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {onOpenInbox ? (
          <button
            onClick={onOpenInbox}
            className="rounded-lg px-4 py-3 text-left w-full transition-colors"
            style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-2)')}
          >
            <div style={monoLabel}>Inbox Items</div>
            <div
              className="text-2xl font-medium leading-none"
              style={{ fontFamily: 'var(--font-mono)', color: agent.inbox_count > 0 ? 'var(--color-status-warn)' : 'var(--color-text-primary)' }}
            >
              {agent.inbox_count}
            </div>
          </button>
        ) : (
          <div
            className="rounded-lg px-4 py-3"
            style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)' }}
          >
            <div style={monoLabel}>Inbox Items</div>
            <div
              className="text-2xl font-medium leading-none"
              style={{ fontFamily: 'var(--font-mono)', color: agent.inbox_count > 0 ? 'var(--color-status-warn)' : 'var(--color-text-primary)' }}
            >
              {agent.inbox_count}
            </div>
          </div>
        )}
        <div
          className="rounded-lg px-4 py-3"
          style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)' }}
        >
          <div style={monoLabel}>Knowledge Files</div>
          <div
            className="text-2xl font-medium leading-none"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}
          >
            {agent.knowledge_count}
          </div>
        </div>
        <div
          className="rounded-lg px-4 py-3"
          style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)' }}
        >
          <div style={monoLabel}>Last Consolidation</div>
          <div
            className="text-xs mt-1"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}
          >
            {agent.last_consolidation ? new Date(agent.last_consolidation).toLocaleString() : 'Never'}
          </div>
        </div>
        <div
          className="rounded-lg px-4 py-3"
          style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)' }}
        >
          <div style={monoLabel}>Scheduled Jobs</div>
          <div
            className="text-2xl font-medium leading-none"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}
          >
            {agentJobs.length}
          </div>
        </div>
      </div>

      {/* Channels + Actions */}
      <div className="grid grid-cols-2 gap-4">
        {/* Channel Status */}
        <div>
          <div
            style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '8px', fontWeight: 500 }}
          >
            Channel Status
          </div>
          <div className="space-y-2">
            {channels.map((ch) => {
              const stats = agent.source_stats?.[ch.handle];
              const isNonActive = stats?.status === 'paused' || stats?.status === 'flagged';
              const flags = stats?.credibility_flags;
              const flagTooltip = flags
                ? `hype: ${flags.hype_pattern} | unverified: ${flags.unverified_claims}`
                : '';
              return (
                <div
                  key={ch.handle}
                  className="rounded-lg px-3 py-2.5"
                  style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{ch.handle}</div>
                      {sourceStatusBadge(stats)}
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      {isNonActive ? (
                        <>
                          <button
                            onClick={() => handleFactCheck(ch.handle)}
                            disabled={triggerFactCheck.isPending}
                            title={flagTooltip}
                            className="px-2 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                            style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--color-status-error)', border: '1px solid rgba(239,68,68,0.3)' }}
                          >
                            Fact-check
                          </button>
                          <button
                            onClick={() => handleResetSource(ch.handle)}
                            disabled={resetSourceStatus.isPending}
                            className="px-2 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                            style={{ backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-default)' }}
                          >
                            Reactivate
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleCollect(ch.handle)}
                          disabled={triggerCollection.isPending}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex items-center"
                          style={{ backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-default)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
                        >
                          Collect Now
                          <Tooltip text="Fetch new videos from this channel, analyze them against the soul, and run consolidation to update the knowledge base." />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs mt-0.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                    Last: {agent.last_checked[ch.handle] ? new Date(agent.last_checked[ch.handle]).toLocaleString() : 'never'}
                    {stats && stats.scores.length > 0 && (
                      <span className="ml-2" title={flagTooltip}>
                        avg: {(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {channels.length === 0 && (
              <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No sources configured</div>
            )}
          </div>
        </div>

        {/* Actions + Scheduled Jobs */}
        <div className="space-y-4">
          <div>
            <div
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '8px', fontWeight: 500 }}
            >
              Actions
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleRun}
                disabled={triggerRun.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-left disabled:opacity-50 flex items-center"
                style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent-dim)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent)')}
              >
                {triggerRun.isPending ? 'Triggering...' : 'Run Now'}
                <Tooltip text="Run the full daily pipeline immediately: collect new videos from all channels → consolidate into knowledge → self-improving research (if enabled)." />
              </button>
              <button
                onClick={handleReevaluate}
                disabled={triggerReevaluation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-left disabled:opacity-50 flex items-center"
                style={{ backgroundColor: 'rgba(109,40,217,0.3)', color: '#c4b5fd', border: '1px solid rgba(109,40,217,0.4)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(109,40,217,0.45)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(109,40,217,0.3)')}
              >
                {triggerReevaluation.isPending ? 'Triggering...' : 'Reevaluate Now'}
                <Tooltip text="Re-score all existing knowledge files using the current soul. Useful after editing the soul to reprioritize what the agent has already learned." />
              </button>
            </div>
          </div>

          {agentJobs.length > 0 && (
            <div>
              <div
                style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '8px', fontWeight: 500 }}
              >
                Scheduled Jobs
              </div>
              <div className="space-y-1">
                {agentJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex justify-between text-xs rounded-lg px-3 py-2"
                    style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)' }}
                  >
                    <span className="truncate mr-2" style={{ color: 'var(--color-text-primary)' }}>{job.name}</span>
                    <span className="shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                      {job.next_run_time ? `Next: ${new Date(job.next_run_time).toLocaleString()}` : 'paused'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {discoveredSources?.content && (
        <div>
          <div
            style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '8px', fontWeight: 500 }}
          >
            Discovered Sources
          </div>
          <pre
            className="rounded-lg p-4 text-xs whitespace-pre-wrap overflow-auto max-h-48"
            style={{
              fontFamily: 'var(--font-mono)',
              backgroundColor: 'var(--color-surface-2)',
              border: '1px solid var(--color-border-subtle)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {discoveredSources.content}
          </pre>
        </div>
      )}
    </div>
  );
}
