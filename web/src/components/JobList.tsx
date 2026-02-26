import { useJobs } from '../api/scheduler';

export default function JobList() {
  const { data: jobs, isLoading, error } = useJobs();

  if (isLoading) return <div className="p-6 text-gray-400">Loading jobs...</div>;
  if (error) return <div className="p-6 text-red-400">Error: {(error as Error).message}</div>;

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-6">Scheduler Jobs</h2>

      {!jobs?.length ? (
        <div className="text-gray-500 text-center py-12">No scheduled jobs.</div>
      ) : (
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Job ID</th>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Next Run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-900/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{job.id}</td>
                  <td className="px-4 py-3">{job.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {job.next_run_time ? new Date(job.next_run_time).toLocaleString() : 'paused'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
