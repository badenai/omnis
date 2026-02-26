import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAgent, useDeleteAgent } from '../api/agents';
import AgentForm from './AgentForm';
import SoulEditor from './SoulEditor';
import StatusPanel from './StatusPanel';
import KnowledgeBrowser from './KnowledgeBrowser';

const TABS = ['Config', 'Soul', 'Status', 'Knowledge'] as const;

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading, error } = useAgent(id!);
  const deleteAgent = useDeleteAgent();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Config');

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (error) return <div className="p-6 text-red-400">Error: {(error as Error).message}</div>;
  if (!agent) return null;

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent.agent_id}"? This cannot be undone.`)) return;
    await deleteAgent.mutateAsync(agent.agent_id);
    navigate('/');
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{agent.agent_id}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {agent.mode} &middot; {agent.model} &middot; {agent.sources.youtube_channels?.length ?? 0} channels
          </p>
        </div>
        <button
          onClick={handleDelete}
          className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded text-sm transition-colors"
        >
          Delete Agent
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-800 mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Config' && <AgentForm agent={agent} />}
      {tab === 'Soul' && <SoulEditor agentId={agent.agent_id} initialSoul={agent.soul} />}
      {tab === 'Status' && <StatusPanel agent={agent} />}
      {tab === 'Knowledge' && <KnowledgeBrowser agentId={agent.agent_id} />}
    </div>
  );
}
