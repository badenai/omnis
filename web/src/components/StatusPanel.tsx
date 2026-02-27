import { useState } from 'react';
import {
  useTriggerCollection, useTriggerConsolidation, useTriggerReevaluation,
  useTriggerResearch, useDiscoveredSources,
} from '../api/scheduler';
import { useJobs } from '../api/scheduler';
import type { AgentDetail } from '../types';

interface Props {
  agent: AgentDetail;
}

export default function StatusPanel({ agent }: Props) {
  const { data: jobs } = useJobs();
  const triggerCollection = useTriggerCollection(agent.agent_id);
  const triggerConsolidation = useTriggerConsolidation(agent.agent_id);
  const triggerReevaluation = useTriggerReevaluation(agent.agent_id);
  const triggerResearch = useTriggerResearch(agent.agent_id);
  const { data: discoveredSources } = useDiscoveredSources(agent.agent_id);
  const [message, setMessage] = useState('');

  const agentJobs = jobs?.filter((j) => j.id.startsWith(agent.agent_id)) ?? [];
  const channels = agent.sources.youtube_channels ?? [];

  const handleCollect = async (handle: string) => {
    setMessage('');
    try {
      await triggerCollection.mutateAsync(handle);
      setMessage(`Triggered collection for ${handle}`);
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    }
  };

  const handleConsolidate = async () => {
    setMessage('');
    try {
      await triggerConsolidation.mutateAsync();
      setMessage('Triggered consolidation');
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    }
  };

  const handleReevaluate = async () => {
    setMessage('');
    try {
      await triggerReevaluation.mutateAsync();
      setMessage('Triggered reevaluation');
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    }
  };

  const handleResearch = async () => {
    setMessage('');
    try {
      await triggerResearch.mutateAsync();
      setMessage('Triggered research session');
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {message && (
        <div className={`px-3 py-2 rounded text-sm ${message.startsWith('Error') ? 'bg-red-900/30 text-red-300' : 'bg-green-900/30 text-green-300'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Inbox Items</div>
          <div className="text-2xl font-semibold text-amber-400">{agent.inbox_count}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Knowledge Files</div>
          <div className="text-2xl font-semibold text-indigo-400">{agent.knowledge_count}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Last Consolidation</div>
          <div className="text-sm text-gray-300">
            {agent.last_consolidation ? new Date(agent.last_consolidation).toLocaleString() : 'Never'}
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Scheduled Jobs</div>
          <div className="text-2xl font-semibold text-gray-300">{agentJobs.length}</div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-400 mb-3">Channel Status</h3>
        <div className="space-y-2">
          {channels.map((ch) => (
            <div key={ch.handle} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
              <div>
                <div className="text-sm font-medium">{ch.handle}</div>
                <div className="text-xs text-gray-500">
                  Last checked: {agent.last_checked[ch.handle] ? new Date(agent.last_checked[ch.handle]).toLocaleString() : 'never'}
                </div>
              </div>
              <button
                onClick={() => handleCollect(ch.handle)}
                disabled={triggerCollection.isPending}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs font-medium transition-colors"
              >
                Collect Now
              </button>
            </div>
          ))}
          {channels.length === 0 && (
            <div className="text-gray-500 text-sm">No channels configured</div>
          )}
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleConsolidate}
          disabled={triggerConsolidation.isPending}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
        >
          {triggerConsolidation.isPending ? 'Triggering...' : 'Run Consolidation Now'}
        </button>
        <button
          onClick={handleReevaluate}
          disabled={triggerReevaluation.isPending}
          className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded text-sm font-medium transition-colors"
        >
          {triggerReevaluation.isPending ? 'Triggering...' : 'Reevaluate Now'}
        </button>
        {agent.mode === 'accumulate' && (
          <button
            onClick={handleResearch}
            disabled={triggerResearch.isPending}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded text-sm font-medium transition-colors"
          >
            {triggerResearch.isPending ? 'Triggering...' : 'Research Now'}
          </button>
        )}
      </div>

      {discoveredSources?.content && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-3">Discovered Sources</h3>
          <pre className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-64">
            {discoveredSources.content}
          </pre>
        </div>
      )}

      {agentJobs.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-3">Scheduled Jobs</h3>
          <div className="space-y-1">
            {agentJobs.map((job) => (
              <div key={job.id} className="flex justify-between text-xs bg-gray-900 border border-gray-800 rounded px-3 py-2">
                <span className="text-gray-300">{job.name}</span>
                <span className="text-gray-500">
                  {job.next_run_time ? `Next: ${new Date(job.next_run_time).toLocaleString()}` : 'paused'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
