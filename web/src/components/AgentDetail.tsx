import { useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useAgent, useDeleteAgent } from '../api/agents';
import AgentForm from './AgentForm';
import SoulEditor from './SoulEditor';
import StatusPanel from './StatusPanel';
import KnowledgeBrowser from './KnowledgeBrowser';
import ChatPanel from './ChatPanel';
import IngestPanel from './IngestPanel';
import InboxPanel from './InboxPanel';

const sectionHeading: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-text-muted)',
  fontWeight: 500,
  marginBottom: '16px',
};

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading, error } = useAgent(id!);
  const deleteAgent = useDeleteAgent();
  const [viewMode, setViewMode] = useState<'chat' | 'manage'>('chat');
  const [showIngest, setShowIngest] = useState(false);
  const [showInbox, setShowInbox] = useState(false);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64" style={{ color: 'var(--color-text-muted)' }}>
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-5 h-5 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--color-accent-dim)', borderTopColor: 'var(--color-accent)' }}
        />
        <p className="text-sm">Loading agent details...</p>
      </div>
    </div>
  );
  if (error) return (
    <div
      className="p-4 rounded-xl text-sm"
      style={{ color: 'var(--color-status-error)', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
    >
      Error: {(error as Error).message}
    </div>
  );
  if (!agent) return null;

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent.agent_id}"? This cannot be undone.`)) return;
    await deleteAgent.mutateAsync(agent.agent_id);
    navigate('/');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-surface-1)' }}
      >
        <div className="flex items-center gap-4 min-w-0">
          {/* Avatar */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--color-accent-glow)', border: '1px solid var(--color-accent-dim)' }}
          >
            <span
              className="text-sm font-semibold uppercase"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}
            >
              {agent.agent_id.substring(0, 1)}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
              {agent.agent_id}
            </h2>
            <p
              className="text-[11px] truncate mt-0.5"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}
            >
              {agent.model} · {agent.sources.youtube_channels?.length ?? 0} channels
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-4">
          {/* Chat / Manage toggle */}
          <div
            className="flex items-center rounded-lg p-0.5"
            style={{ backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-border-default)' }}
          >
            {(['chat', 'manage'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors duration-150"
                style={{
                  backgroundColor: viewMode === mode ? 'var(--color-accent)' : 'transparent',
                  color: viewMode === mode ? '#fff' : 'var(--color-text-secondary)',
                }}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            onClick={handleDelete}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150"
            style={{
              color: 'var(--color-status-error)',
              backgroundColor: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)')}
          >
            Liquidate
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
          <div className="max-w-[1600px] mx-auto p-6 pb-24 space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

              {/* Left Column: Config & Soul */}
              <div className="xl:col-span-1 space-y-6">
                <div
                  className="rounded-xl overflow-hidden p-5"
                  style={{ backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-border-subtle)' }}
                >
                  <div style={sectionHeading}>Agent Configuration</div>
                  <AgentForm agent={agent} />
                </div>

                <div
                  className="rounded-xl overflow-hidden p-5"
                  style={{ backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-border-subtle)' }}
                >
                  <div style={sectionHeading}>Core Identity (Soul)</div>
                  <SoulEditor agentId={agent.agent_id} initialSoul={agent.soul} />
                </div>
              </div>

              {/* Right Column: Status & Knowledge */}
              <div className="xl:col-span-2 flex flex-col gap-6">
                <div
                  className="rounded-xl p-5"
                  style={{ backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-border-subtle)' }}
                >
                  <div style={sectionHeading}>Status & Telemetry</div>
                  <StatusPanel agent={agent} onOpenInbox={() => setShowInbox(true)} />
                </div>

                <div
                  className="rounded-xl p-5 flex-1 min-h-[500px] flex flex-col"
                  style={{ backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-border-subtle)' }}
                >
                  <div style={sectionHeading}>Knowledge Brain</div>
                  <div
                    className="flex-1 overflow-hidden relative rounded-xl"
                    style={{ border: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-surface-2)' }}
                  >
                    <KnowledgeBrowser agentId={agent.agent_id} />
                  </div>
                </div>
              </div>
            </div>

            {/* FAB for Ingest */}
            <button
              onClick={() => setShowIngest(!showIngest)}
              className="fixed bottom-8 right-8 z-50 flex items-center justify-center w-13 h-13 rounded-xl text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
              style={{ width: '52px', height: '52px', backgroundColor: 'var(--color-accent)', boxShadow: '0 8px 24px var(--color-accent-glow)' }}
            >
              {showIngest ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
              )}
            </button>

            {/* Slide-over for Ingest */}
            {showIngest && (
              <div
                className="fixed inset-0 z-40 flex justify-end"
                style={{ backgroundColor: 'rgba(8,8,9,0.7)' }}
                onClick={(e) => { if (e.target === e.currentTarget) setShowIngest(false); }}
              >
                <div
                  className="w-full max-w-md h-full p-6 overflow-y-auto animate-in slide-in-from-right duration-300"
                  style={{ backgroundColor: 'var(--color-surface-1)', borderLeft: '1px solid var(--color-border-subtle)' }}
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      Feed Knowledge
                    </h3>
                    <button
                      onClick={() => setShowIngest(false)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--color-text-muted)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-3)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <IngestPanel agent={agent} />
                </div>
              </div>
            )}

            {/* Slide-over for Inbox */}
            {showInbox && (
              <div
                className="fixed inset-0 z-40 flex justify-end"
                style={{ backgroundColor: 'rgba(8,8,9,0.7)' }}
                onClick={(e) => { if (e.target === e.currentTarget) setShowInbox(false); }}
              >
                <div
                  className="w-full max-w-md h-full p-6 overflow-y-auto animate-in slide-in-from-right duration-300"
                  style={{ backgroundColor: 'var(--color-surface-1)', borderLeft: '1px solid var(--color-border-subtle)' }}
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Inbox
                      </h3>
                      {agent.inbox_count > 0 && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-status-warn)',
                            backgroundColor: 'rgba(234,179,8,0.15)',
                          }}
                        >
                          {agent.inbox_count}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setShowInbox(false)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--color-text-muted)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-3)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <InboxPanel agentId={agent.agent_id} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
