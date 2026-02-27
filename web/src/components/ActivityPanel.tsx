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
    <div className="flex items-start gap-2 py-2">
      <span className="mt-0.5 shrink-0 w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
      <div className="min-w-0">
        <div className="text-xs font-medium text-gray-200 truncate">
          {job.agent_id} / {taskLabel(job)}
        </div>
        <div className="text-xs text-gray-400 truncate">{job.step}</div>
        <div className="text-xs text-gray-600">{elapsed(job.started_at)} ago</div>
      </div>
    </div>
  );
}

function HistoryJob({ job }: { job: JobActivity }) {
  const ok = job.state === 'completed';
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className={`mt-0.5 shrink-0 text-xs ${ok ? 'text-green-500' : 'text-red-500'}`}>
        {ok ? '✓' : '✗'}
      </span>
      <div className="min-w-0">
        <div className="text-xs text-gray-400 truncate">
          {job.agent_id} / {taskLabel(job)}
          {job.finished_at && (
            <span className="text-gray-600 ml-1">
              ({duration(job.started_at, job.finished_at)})
            </span>
          )}
        </div>
        {!ok && job.error && (
          <div className="text-xs text-red-400 truncate">{job.error}</div>
        )}
      </div>
    </div>
  );
}

export default function ActivityPanel() {
  const { data } = useActivity();
  const active = data?.active ?? [];
  const history = data?.history ?? [];

  if (active.length === 0 && history.length === 0) return null;

  return (
    <div className="border-t border-gray-800 p-3">
      {active.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Running</div>
          {active.map((job) => <ActiveJob key={job.key} job={job} />)}
        </div>
      )}
      {history.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Recent</div>
          {history.slice(0, 8).map((job) => <HistoryJob key={`${job.key}-${job.finished_at}`} job={job} />)}
        </div>
      )}
    </div>
  );
}
