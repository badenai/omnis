import { useActivity, type JobActivity } from '../api/scheduler';

function elapsed(startedAt: string): string {
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

function ActiveJob({ job }: { job: JobActivity }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span
        className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full animate-pulse"
        style={{ backgroundColor: 'var(--color-status-active)' }}
      />
      <div className="min-w-0">
        <div className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
          {job.agent_id} / {taskLabel(job)}
        </div>
        <div className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{job.step}</div>
        <div className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
          {elapsed(job.started_at)} ago
        </div>
      </div>
    </div>
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
      <div className="min-w-0">
        <div className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
          {job.agent_id} / {taskLabel(job)}
          {job.finished_at && (
            <span className="ml-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
              ({duration(job.started_at, job.finished_at)})
            </span>
          )}
        </div>
        {!ok && job.error && (
          <div className="text-xs truncate" style={{ color: 'var(--color-status-error)' }}>{job.error}</div>
        )}
      </div>
    </div>
  );
}

export default function ActivityPanel() {
  const { data } = useActivity();
  const active = data?.active ?? [];
  const history = data?.history ?? [];

  if (active.length === 0 && history.length === 0) {
    return (
      <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        No recent activity
      </div>
    );
  }

  return (
    <div>
      {active.length > 0 && (
        <div className="mb-2">
          <div
            className="text-[9px] uppercase tracking-[0.1em] font-medium mb-1"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
          >
            Running
          </div>
          {active.map((job) => <ActiveJob key={job.key} job={job} />)}
        </div>
      )}
      {history.length > 0 && (
        <div>
          <div
            className="text-[9px] uppercase tracking-[0.1em] font-medium mb-1"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
          >
            Recent
          </div>
          {history.slice(0, 8).map((job) => <HistoryJob key={`${job.key}-${job.finished_at}`} job={job} />)}
        </div>
      )}
    </div>
  );
}
