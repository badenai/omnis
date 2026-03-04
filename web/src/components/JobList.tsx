import { useJobs } from '../api/scheduler';

export default function JobList() {
  const { data: jobs, isLoading, error } = useJobs();

  if (isLoading) return (
    <div className="flex items-center gap-2 py-8" style={{ color: 'var(--color-text-muted)' }}>
      <div
        className="w-4 h-4 border-2 rounded-full animate-spin shrink-0"
        style={{ borderColor: 'var(--color-accent-dim)', borderTopColor: 'var(--color-accent)' }}
      />
      <span className="text-sm">Loading jobs...</span>
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

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 32 }}>
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          Scheduler
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
          Scheduled jobs and their next execution times.
        </p>
      </div>

      {!jobs?.length ? (
        <div
          className="flex items-center justify-center py-16 text-sm rounded-lg"
          style={{ color: 'var(--color-text-muted)', border: '1px dashed var(--color-border-default)' }}
        >
          No scheduled jobs.
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--color-border-subtle)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <th
                  className="text-left px-4 py-3"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', fontWeight: 500 }}
                >
                  Job ID
                </th>
                <th
                  className="text-left px-4 py-3"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', fontWeight: 500 }}
                >
                  Name
                </th>
                <th
                  className="text-left px-4 py-3"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', fontWeight: 500 }}
                >
                  Next Run
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job, i) => (
                <tr
                  key={job.id}
                  style={{
                    borderTop: i > 0 ? `1px solid var(--color-border-subtle)` : undefined,
                    backgroundColor: 'var(--color-surface-1)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-1)')}
                >
                  <td className="px-4 py-3">
                    <span
                      className="text-xs"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}
                    >
                      {job.id}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                    {job.name}
                  </td>
                  <td className="px-4 py-3">
                    {job.next_run_time ? (
                      <span
                        className="text-xs"
                        style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}
                      >
                        {new Date(job.next_run_time).toLocaleString()}
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                        style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-status-warn)', backgroundColor: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}
                      >
                        paused
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </div>
  );
}
