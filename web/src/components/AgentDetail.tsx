import { useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useAgent, useDeleteAgent } from '../api/agents';
import AgentForm from './AgentForm';
import SoulEditor from './SoulEditor';
import StatusPanel from './StatusPanel';
import KnowledgeBrowser from './KnowledgeBrowser';
import ChatPanel from './ChatPanel';
import IngestPanel from './IngestPanel';

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading, error } = useAgent(id!);
  const deleteAgent = useDeleteAgent();
  const [viewMode, setViewMode] = useState<'chat' | 'manage'>('chat');
  const [showIngest, setShowIngest] = useState(false);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-500">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
        <p className="text-sm font-medium">Loading agent details...</p>
      </div>
    </div>
  );
  if (error) return <div className="p-6 text-red-400 bg-red-900/20 border border-red-500/20 rounded-xl">Error: {(error as Error).message}</div>;
  if (!agent) return null;

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent.agent_id}"? This cannot be undone.`)) return;
    await deleteAgent.mutateAsync(agent.agent_id);
    navigate('/');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header Section */}
      <div className="flex items-center justify-between bg-gray-900/40 backdrop-blur-xl border-b border-white/5 px-8 py-5 shrink-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-4 ring-gray-950 shrink-0">
            <span className="text-xl font-bold text-white uppercase">{agent.agent_id.substring(0, 1)}</span>
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">{agent.agent_id}</h2>
            <p className="text-sm text-gray-400 flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                {agent.model}
              </span>
              <span className="w-1 h-1 rounded-full bg-gray-700" />
              <span>{agent.sources.youtube_channels?.length ?? 0} active channels</span>
            </p>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          {/* Chat / Manage toggle */}
          <div className="flex items-center bg-gray-800/60 rounded-lg p-1 ring-1 ring-white/10">
            <button
              onClick={() => setViewMode('chat')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'chat'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setViewMode('manage')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'manage'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Manage
            </button>
          </div>

          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/30 rounded-xl text-sm font-semibold transition-all duration-200"
          >
            Liquidate Agent
          </button>
        </div>
      </div>

      {/* Chat view */}
      {viewMode === 'chat' && (
        <div className="flex-1 min-h-0">
          <ChatPanel agentId={agent.agent_id} />
        </div>
      )}

      {/* Manage view */}
      {viewMode === 'manage' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto p-8 pb-24 space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

              {/* Left Column: Config & Soul */}
              <div className="xl:col-span-1 space-y-6">
                <div className="bg-gray-900/60 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden p-6">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    Agent Configuration
                  </h3>
                  <AgentForm agent={agent} />
                </div>

                <div className="bg-gray-900/60 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden p-6">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                    <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                    Core Identity (Soul)
                  </h3>
                  <SoulEditor agentId={agent.agent_id} initialSoul={agent.soul} />
                </div>
              </div>

              {/* Right Column: Status & Knowledge */}
              <div className="xl:col-span-2 flex flex-col gap-6">
                <div className="bg-gray-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-6">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    Status & Telemetry
                  </h3>
                  <StatusPanel agent={agent} />
                </div>

                <div className="bg-gray-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-6 flex-1 min-h-[500px] flex flex-col">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    Knowledge Brain
                  </h3>
                  <div className="flex-1 overflow-hidden relative rounded-xl border border-white/5 bg-gray-950/50">
                    <KnowledgeBrowser agentId={agent.agent_id} />
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Action Button for Ingest */}
            <button
              onClick={() => setShowIngest(!showIngest)}
              className="fixed bottom-8 right-8 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/30 transition-transform hover:scale-105 active:scale-95"
            >
              {showIngest ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              )}
            </button>

            {/* Slide-over for Ingest */}
            {showIngest && (
              <div className="fixed inset-0 z-40 bg-gray-950/60 backdrop-blur-sm flex justify-end">
                <div className="w-full max-w-md h-full bg-gray-900 border-l border-white/5 shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-300">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                      <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                      Feed Knowledge
                    </h3>
                    <button onClick={() => setShowIngest(false)} className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-white/5">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <IngestPanel agent={agent} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
