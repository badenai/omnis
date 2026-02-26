import { Link } from 'react-router-dom';
import { useAgents } from '../api/agents';

export default function AgentList() {
  const { data: agents, isLoading, error } = useAgents();

  if (isLoading) return <div className="p-6 text-gray-400">Loading agents...</div>;
  if (error) return <div className="p-6 text-red-400">Error: {(error as Error).message}</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Agents</h2>
        <Link
          to="/agents/new"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-medium transition-colors"
        >
          New Agent
        </Link>
      </div>

      {!agents?.length ? (
        <div className="text-gray-500 text-center py-12">
          No agents configured. Create one to get started.
        </div>
      ) : (
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Agent</th>
                <th className="text-left px-4 py-3 font-medium">Mode</th>
                <th className="text-left px-4 py-3 font-medium">Model</th>
                <th className="text-right px-4 py-3 font-medium">Channels</th>
                <th className="text-right px-4 py-3 font-medium">Inbox</th>
                <th className="text-right px-4 py-3 font-medium">Knowledge</th>
                <th className="text-left px-4 py-3 font-medium">Last Consolidation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {agents.map((a) => (
                <tr key={a.agent_id} className="hover:bg-gray-900/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/agents/${a.agent_id}`} className="text-indigo-400 hover:text-indigo-300 font-medium">
                      {a.agent_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.mode === 'accumulate' ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300'}`}>
                      {a.mode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{a.model}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{a.channel_count}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={a.inbox_count > 0 ? 'text-amber-400' : 'text-gray-500'}>{a.inbox_count}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">{a.knowledge_count}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {a.last_consolidation ? new Date(a.last_consolidation).toLocaleString() : 'never'}
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
