import { useEffect, useRef, useState } from 'react';
import { useActivityStream, useTriggerCollection, useTriggerConsolidation, useTriggerReevaluation, type JobActivity } from '../api/scheduler';
import type { LogEntry } from '../types';

function RetryCountdown({ msg, ts }: { msg: string; ts: string }) {
  const match = msg.match(/retrying in (\d+)s/);
  if (!match) return null;
  const waitSecs = parseInt(match[1]);

  const calcRemaining = () =>
    Math.max(0, waitSecs - (Date.now() - new Date(ts).getTime()) / 1000);

  const [remaining, setRemaining] = useState(calcRemaining);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setRemaining(calcRemaining()), 250);
    return () => clearInterval(id);
  }, [waitSecs, ts]);  // eslint-disable-line

  if (remaining <= 0) {
    return (
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-status-ok)', marginLeft: 6 }}>
        retrying…
      </span>
    );
  }

  const pct = (remaining / waitSecs) * 100;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        marginLeft: 6,
        padding: '1px 6px',
        borderRadius: 4,
        backgroundColor: 'rgba(245,158,11,0.1)',
        border: '1px solid rgba(245,158,11,0.2)',
      }}
    >
      {/* mini progress bar */}
      <span style={{ width: 28, height: 3, borderRadius: 2, backgroundColor: 'rgba(245,158,11,0.2)', overflow: 'hidden', flexShrink: 0 }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, backgroundColor: 'var(--color-status-warn)', borderRadius: 2, transition: 'width 250ms linear' }} />
      </span>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-status-warn)', lineHeight: 1 }}>
        {Math.ceil(remaining)}s
      </span>
    </span>
  );
}

function useElapsed(startedAt: string): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function duration(startedAt: string, finishedAt: string): string {
  const secs = Math.floor((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function taskLabel(job: JobActivity): string {
  if (job.task.startsWith('collect/')) return `collect ${job.task.slice(8)}`;
  return job.task;
}

function scoreColor(msg: string): string {
  const match = msg.match(/score ([0-9.]+)/);
  if (!match) return 'var(--color-text-secondary)';
  const score = parseFloat(match[1]);
  if (score >= 0.6) return 'var(--color-status-ok)';
  if (score >= 0.3) return '#d4a017';
  return 'var(--color-status-error)';
}

function LogLine({ entry }: { entry: LogEntry }) {
  const time = new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const isRetry = entry.msg.startsWith('↻');
  const hasScore = /score [0-9.]+/.test(entry.msg);
  const color = isRetry
    ? 'var(--color-status-warn)'
    : hasScore
    ? scoreColor(entry.msg)
    : 'var(--color-text-secondary)';
  return (
    <div className="flex gap-2 text-[11px] leading-relaxed items-baseline">
      <span className="shrink-0 tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
        {time}
      </span>
      <span style={{ color, fontFamily: 'var(--font-mono)', wordBreak: 'break-word' }}>
        {entry.msg}
      </span>
      {isRetry && <RetryCountdown msg={entry.msg} ts={entry.ts} />}
    </div>
  );
}

function ActiveJobCard({ job }: { job: JobActivity }) {
  const elapsed = useElapsed(job.started_at);
  const logRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);

  useEffect(() => {
    if (!logRef.current || userScrolled) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job.logs, userScrolled]);

  function handleScroll() {
    if (!logRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logRef.current;
    setUserScrolled(scrollHeight - scrollTop - clientHeight > 8);
  }

  return (
    <div
      className="rounded mb-2 overflow-hidden"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-2 py-1.5"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}
      >
        <span
          className="shrink-0 w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: 'var(--color-status-active)' }}
        />
        <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--color-text-primary)' }}>
          {job.agent_id} / {taskLabel(job)}
        </span>
        <span className="text-[10px] tabular-nums shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
          {elapsed}
        </span>
      </div>

      {/* Current step */}
      <div className="px-2 py-1 text-[10px] truncate" style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
        {job.step}
      </div>

      {/* Log scroll area */}
      <div
        ref={logRef}
        onScroll={handleScroll}
        className="px-2 py-1.5 overflow-y-auto flex flex-col gap-0.5"
        style={{ maxHeight: '280px' }}
      >
        {job.logs.length === 0 ? (
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Waiting for log output…</span>
        ) : (
          job.logs.map((entry, i) => <LogLine key={i} entry={entry} />)
        )}
      </div>
    </div>
  );
}

function RetryButton({ job }: { job: JobActivity }) {
  const triggerCollect = useTriggerCollection(job.agent_id);
  const triggerConsolidate = useTriggerConsolidation(job.agent_id);
  const triggerReevaluate = useTriggerReevaluation(job.agent_id);

  const isPending = triggerCollect.isPending || triggerConsolidate.isPending || triggerReevaluate.isPending;
  const isSuccess = triggerCollect.isSuccess || triggerConsolidate.isSuccess || triggerReevaluate.isSuccess;

  const handleRetry = () => {
    if (job.task.startsWith('collect/')) {
      triggerCollect.mutate(job.task.slice(8));
    } else if (job.task === 'consolidation') {
      triggerConsolidate.mutate();
    } else if (job.task === 'reevaluation') {
      triggerReevaluate.mutate();
    }
  };

  // Only show for retryable tasks
  if (!job.task.startsWith('collect/') && job.task !== 'consolidation' && job.task !== 'reevaluation') {
    return null;
  }

  return (
    <button
      onClick={handleRetry}
      disabled={isPending || isSuccess}
      title={isSuccess ? 'Queued' : 'Retry this job'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 7px',
        borderRadius: 4,
        border: '1px solid',
        borderColor: isSuccess ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)',
        backgroundColor: isSuccess ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.07)',
        color: isSuccess ? 'var(--color-status-ok)' : 'var(--color-status-error)',
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        cursor: isPending || isSuccess ? 'default' : 'pointer',
        opacity: isPending ? 0.6 : 1,
        transition: 'all 150ms',
        flexShrink: 0,
        lineHeight: 1.6,
      }}
      onMouseEnter={e => {
        if (!isPending && !isSuccess) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.5)';
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.14)';
        }
      }}
      onMouseLeave={e => {
        if (!isPending && !isSuccess) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.25)';
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.07)';
        }
      }}
    >
      {isPending ? (
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
          <path d="M6 2a4 4 0 1 0 4 4" />
        </svg>
      ) : isSuccess ? (
        '✓ queued'
      ) : (
        <>
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2a5 5 0 1 0 1 5" />
            <path d="M10 2v3h-3" />
          </svg>
          retry
        </>
      )}
    </button>
  );
}

function HistoryJob({ job }: { job: JobActivity }) {
  const ok = job.state === 'completed';
  return (
    <div className="flex items-start gap-2 py-1">
      <span
        className="mt-0.5 shrink-0 text-xs"
        style={{ color: ok ? 'var(--color-status-ok)' : 'var(--color-status-error)' }}
      >
        {ok ? '✓' : '✗'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
            {job.agent_id} / {taskLabel(job)}
          </span>
          {job.finished_at && (
            <span className="text-[10px] shrink-0 tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
              ({duration(job.started_at, job.finished_at)})
            </span>
          )}
          {!ok && <RetryButton job={job} />}
        </div>
        {!ok && job.error && (
          <div className="text-[10px] truncate" title={job.error} style={{ color: 'var(--color-status-error)', marginTop: 1 }}>
            {job.error}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ActivityPanel() {
  const { active, history } = useActivityStream();

  if (active.length === 0 && history.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-text-muted)' }} />
        No activity
      </div>
    );
  }

  return (
    <div>
      {active.length > 0 && (
        <div className="mb-3">
          <div
            className="text-[9px] uppercase tracking-[0.1em] font-medium mb-2"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
          >
            Running
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 8 }}>
            {active.map((job) => <ActiveJobCard key={job.key} job={job} />)}
          </div>
        </div>
      )}
      {history.length > 0 && (
        <div>
          <div
            className="text-[9px] uppercase tracking-[0.1em] font-medium mb-1.5"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
          >
            Recent
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0 24px' }}>
            {history.slice(0, 8).map((job) => (
              <HistoryJob key={`${job.key}-${job.finished_at}`} job={job} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
