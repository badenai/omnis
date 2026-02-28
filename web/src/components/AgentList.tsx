import { Link } from 'react-router-dom';
import { useAgents } from '../api/agents';

export default function AgentList() {
  const { data: agents, isLoading, error } = useAgents();

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-500">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
        <p className="text-sm font-medium">Loading agents...</p>
      </div>
    </div>
  );
  if (error) return <div className="p-6 text-red-400 bg-red-900/20 border border-red-500/20 rounded-xl">Error: {(error as Error).message}</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Knowledge Agents</h2>
          <p className="text-gray-400">Manage and monitor your specialized AI agents.</p>
        </div>
        <Link
          to="/agents/new"
          className="flex items-center gap-2 px-5 py-2.5 bg-white text-gray-950 hover:bg-gray-200 rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg shadow-white/5 ring-1 ring-white/10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
          Deploy Agent
        </Link>
      </div>

      {!agents?.length ? (
        <div className="flex flex-col items-center justify-center p-16 text-center border-2 border-dashed border-white/5 rounded-3xl bg-gray-900/20 backdrop-blur-sm">
          <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-white/10">
            <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          </div>
          <h3 className="text-lg font-medium text-gray-200 mb-1">No agents deployed</h3>
          <p className="text-gray-500 max-w-sm mb-6">Create your first intelligence agent to begin gathering and synthesizing knowledge.</p>
          <Link to="/agents/new" className="text-indigo-400 hover:text-indigo-300 font-medium text-sm flex items-center gap-1">
            Create Agent <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {agents.map((a) => (
            <Link 
              key={a.agent_id} 
              to={`/agents/${a.agent_id}`}
              className="group flex flex-col bg-gray-900/60 backdrop-blur-xl border border-white/5 hover:border-indigo-500/30 rounded-3xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1"
            >
              {/* Card Header */}
              <div className="p-6 border-b border-white/5">
                <div className="mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center shadow-inner ring-1 ring-white/10">
                    <span className="text-lg font-bold text-white uppercase tracking-wider">{a.agent_id.substring(0, 1)}</span>
                  </div>
                </div>
                
                <h3 className="text-xl font-bold text-white mb-1 group-hover:text-indigo-400 transition-colors line-clamp-1" title={a.agent_id}>{a.agent_id}</h3>
                <p className="text-xs text-gray-500 font-medium flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                  {a.model}
                </p>
              </div>

              {/* Card Body - Metrics Grid */}
              <div className="p-6 grid grid-cols-2 gap-4 flex-1">
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Inbox</div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-semibold tracking-tight ${a.inbox_count > 0 ? 'text-amber-400' : 'text-gray-300'}`}>{a.inbox_count}</span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Knowledge</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-indigo-400 tracking-tight">{a.knowledge_count}</span>
                  </div>
                </div>

                <div className="space-y-1 col-span-2 mt-2">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Channels</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-300">{a.channel_count} configured</span>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="px-6 py-4 bg-gray-950/50 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-medium text-gray-500">
                  {a.last_consolidation 
                    ? `Sync: ${new Date(a.last_consolidation).toLocaleDateString([], {month: 'short', day: 'numeric'})}` 
                    : 'Never synced'}
                </span>
                <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-gray-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
