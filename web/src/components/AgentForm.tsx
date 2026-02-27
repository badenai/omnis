import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateAgent, useUpdateConfig } from '../api/agents';
import type { AgentDetail, ChannelSource, AgentResearch } from '../types';
import ChannelList from './ChannelList';
import CronInput from './CronInput';

interface Props {
  agent?: AgentDetail;
}

export default function AgentForm({ agent }: Props) {
  const isEdit = !!agent;
  const navigate = useNavigate();
  const createAgent = useCreateAgent();
  const updateConfig = useUpdateConfig(agent?.agent_id ?? '');

  const [agentId, setAgentId] = useState(agent?.agent_id ?? '');
  const [mode, setMode] = useState(agent?.mode ?? 'accumulate');
  const [model, setModel] = useState(agent?.model ?? 'gemini');
  const [analysisMode, setAnalysisMode] = useState(agent?.analysis_mode ?? 'transcript_only');
  const [collectionModel, setCollectionModel] = useState(agent?.collection_model ?? 'gemini-3-flash-preview');
  const [consolidationModel, setConsolidationModel] = useState(agent?.consolidation_model ?? 'gemini-3.1-pro-preview');
  const [channels, setChannels] = useState<ChannelSource[]>(
    agent?.sources.youtube_channels ?? []
  );
  const [consolidationSchedule, setConsolidationSchedule] = useState(
    agent?.consolidation_schedule ?? '0 3 * * 0'
  );
  const [halfLife, setHalfLife] = useState(agent?.decay.half_life_days ?? 365);
  const [researchEnabled, setResearchEnabled] = useState(agent?.research?.enabled ?? false);
  const [researchSchedule, setResearchSchedule] = useState(agent?.research?.schedule ?? '0 10 * * *');
  const [soul, setSoul] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const research: AgentResearch = { enabled: researchEnabled, schedule: researchSchedule };
      if (isEdit) {
        await updateConfig.mutateAsync({
          mode,
          model,
          analysis_mode: analysisMode,
          sources: { youtube_channels: channels },
          consolidation_schedule: consolidationSchedule,
          decay: { half_life_days: halfLife },
          collection_model: collectionModel,
          consolidation_model: consolidationModel,
          research,
        });
        setMessage('Config saved.');
      } else {
        await createAgent.mutateAsync({
          agent_id: agentId,
          mode,
          model,
          analysis_mode: analysisMode,
          sources: { youtube_channels: channels },
          consolidation_schedule: consolidationSchedule,
          decay: { half_life_days: halfLife },
          collection_model: collectionModel,
          consolidation_model: consolidationModel,
          soul,
          research,
        });
        navigate(`/agents/${agentId}`);
      }
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      {!isEdit && (
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Agent ID</label>
          <input
            type="text"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            required
            pattern="[a-z0-9\-]+"
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            placeholder="my-agent-name"
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="accumulate">accumulate</option>
            <option value="watch">watch</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="gemini">gemini</option>
            <option value="openai">openai</option>
            <option value="claude">claude</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Analysis Mode</label>
          <select
            value={analysisMode}
            onChange={(e) => setAnalysisMode(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="transcript_only">transcript_only</option>
            <option value="full_video">full_video</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Collection Model</label>
          <input
            type="text"
            value={collectionModel}
            onChange={(e) => setCollectionModel(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Consolidation Model</label>
          <input
            type="text"
            value={consolidationModel}
            onChange={(e) => setConsolidationModel(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">YouTube Channels</label>
        <ChannelList channels={channels} onChange={setChannels} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Consolidation Schedule</label>
        <CronInput value={consolidationSchedule} onChange={setConsolidationSchedule} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">
          Decay Half-Life: {halfLife} days
        </label>
        <input
          type="range"
          min={30}
          max={3650}
          value={halfLife}
          onChange={(e) => setHalfLife(Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div className="border border-gray-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="research-enabled"
            checked={researchEnabled}
            onChange={(e) => setResearchEnabled(e.target.checked)}
            className="w-4 h-4 accent-indigo-500"
          />
          <label htmlFor="research-enabled" className="text-sm font-medium text-gray-300">
            Autonomous Research — Let the AI search the web guided by its soul
          </label>
        </div>
        {researchEnabled && (
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Research Schedule</label>
            <CronInput value={researchSchedule} onChange={setResearchSchedule} />
          </div>
        )}
      </div>

      {!isEdit && (
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Soul (SOUL.md)</label>
          <textarea
            value={soul}
            onChange={(e) => setSoul(e.target.value)}
            rows={8}
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500"
            placeholder="Agent personality and instructions..."
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
        >
          {saving ? 'Saving...' : isEdit ? 'Save Config' : 'Create Agent'}
        </button>
        {message && (
          <span className={`text-sm ${message.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
