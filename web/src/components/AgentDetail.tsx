import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { useAgent, useDeleteAgent, useUpdateConfig, useUpdateSoul, useIntegrateSoul, useRevertSoul } from '../api/agents';
import {
  useTriggerRun, useTriggerReevaluation, useTriggerCollection,
  useTriggerFactCheck, useResetSourceStatus, useJobs, useSoulSuggestions,
  useDiscoveredSources,
} from '../api/scheduler';
import AgentForm from './AgentForm';
import SoulEditor from './SoulEditor';
import KnowledgeBrowser from './KnowledgeBrowser';
import ChatPanel from './ChatPanel';
import IngestPanel from './IngestPanel';
import InboxPanel from './InboxPanel';
import SessionPanel from './SessionPanel';

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-surface-1)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 12,
  padding: 16,
};

const monoLabel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-text-muted)',
  fontWeight: 500,
};


function parseSuggestions(markdown: string): Array<{ id: string; title: string; content: string }> {
  // Primary: split on ## headings, keep only chunks that start with ##
  const bySections = markdown.split(/^(?=## )/m).filter(s => s.trimStart().startsWith('## '));
  if (bySections.length > 0) return bySections.map((s, i) => ({
    id: String(i),
    content: s.trim(),
    title: s.match(/^## (.+)/m)?.[1]?.trim() ?? `Suggestion ${i + 1}`,
  }));

  // Fallback: bold-numbered items **1. Title** (legacy Gemini format)
  const byBoldNumbers = markdown.split(/^(?=\*\*\d+\.)/m).filter(s => s.trim().match(/^\*\*\d+\./));
  if (byBoldNumbers.length > 0) return byBoldNumbers.map((s, i) => ({
    id: String(i),
    content: s.trim(),
    title: s.match(/^\*\*\d+\.\s+(.+?)\*\*/)?.[1]?.trim() ?? `Suggestion ${i + 1}`,
  }));

  // Fallback: plain numbered items
  const byNumbers = markdown.split(/^(?=\d+\. )/m).filter(s => s.trim().match(/^\d+\./));
  if (byNumbers.length > 0) return byNumbers.map((s, i) => ({
    id: String(i),
    content: s.trim(),
    title: s.match(/^\d+\.\s+\*\*(.+?)\*\*/)?.[1] ?? `Suggestion ${i + 1}`,
  }));

  return [{ id: '0', content: markdown.trim(), title: 'Soul Evolution Suggestions' }];
}

/** Returns the set of handles discovered by self-improvement after `since`. */
function parseDiscoveredHandles(content: string, since: string | null): Set<string> {
  const result = new Set<string>();
  const blocks = content.split(/^## /m).slice(1);
  for (const block of blocks) {
    const tsLine = block.match(/^([^\n]+)/);
    const handleLine = block.match(/\*\*Handle:\*\*\s*(@\S+)/);
    if (!tsLine || !handleLine) continue;
    if (since && new Date(tsLine[1].trim()) <= new Date(since)) continue;
    result.add(handleLine[1]);
  }
  return result;
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)' }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)' }}>{title}</span>
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ transition: 'transform 200ms', transform: open ? 'rotate(180deg)' : 'none', color: 'var(--color-text-muted)', flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div style={{ padding: '0 20px 20px' }}>{children}</div>}
    </div>
  );
}

interface SoulEvolutionTabProps {
  agentId: string;
  soul: string;
  hasSoulBackup: boolean;
  suggestionsData: { suggestions: string | null } | undefined;
  refetchSuggestions: () => void;
  isFetchingSuggestions: boolean;
}

function SoulEvolutionTab({ agentId, soul, hasSoulBackup, suggestionsData, refetchSuggestions, isFetchingSuggestions }: SoulEvolutionTabProps) {
  const updateSoul = useUpdateSoul(agentId);
  const integrateSoul = useIntegrateSoul(agentId);
  const revertSoul = useRevertSoul(agentId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [integrationMsg, setIntegrationMsg] = useState('');
  const [previewSoul, setPreviewSoul] = useState<string | null>(null);
  const [incorporated, setIncorporated] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`omnis_incorporated_${agentId}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const suggestions = useMemo(
    () => (suggestionsData?.suggestions ? parseSuggestions(suggestionsData.suggestions) : []),
    [suggestionsData?.suggestions],
  );

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleIntegrate = async () => {
    const selectedTexts = suggestions.filter(s => selected.has(s.id)).map(s => s.content);
    setIntegrationMsg('');
    try {
      const result = await integrateSoul.mutateAsync({ soul, suggestions: selectedTexts });
      setPreviewSoul(result.integrated_soul);
    } catch (e) {
      setIntegrationMsg('Error: ' + (e as Error).message);
    }
  };

  const handleApply = async () => {
    if (!previewSoul) return;
    try {
      await updateSoul.mutateAsync(previewSoul);
      const next = new Set(incorporated);
      suggestions.filter(s => selected.has(s.id)).forEach(s => next.add(s.title));
      setIncorporated(next);
      localStorage.setItem(`omnis_incorporated_${agentId}`, JSON.stringify([...next]));
      setPreviewSoul(null);
      setSelected(new Set());
      setIntegrationMsg('Soul updated. Revert available if needed.');
    } catch (e) {
      setIntegrationMsg('Error: ' + (e as Error).message);
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {previewSoul ? (
          /* Preview mode header */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)', flex: 1 }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-status-warning, #f59e0b)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Preview — review before applying
            </div>
            <button
              onClick={handleApply}
              disabled={updateSoul.isPending}
              style={{ padding: '5px 12px', fontSize: 11, borderRadius: 6, border: 'none', backgroundColor: 'var(--color-accent)', color: '#fff', cursor: updateSoul.isPending ? 'default' : 'pointer', opacity: updateSoul.isPending ? 0.7 : 1, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)' }}
            >
              {updateSoul.isPending && (
                <div style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
              )}
              ✓ Apply Soul
            </button>
            <button
              onClick={() => setPreviewSoul(null)}
              style={{ padding: '5px 12px', fontSize: 11, borderRadius: 6, border: '1px solid var(--color-border-default)', backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
            >
              ✗ Cancel
            </button>
          </>
        ) : (
          /* Normal mode header */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)', flex: 1 }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-accent)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Soul Evolution Suggestions
            </div>
            {/* Integrate button — appears inline in header when items selected */}
            {selected.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {selected.size} selected
                </span>
                {integrationMsg && (
                  <span style={{ fontSize: 11, color: integrationMsg.startsWith('Error') ? 'var(--color-status-error)' : 'var(--color-status-success)' }}>
                    {integrationMsg}
                  </span>
                )}
                <button
                  onClick={handleIntegrate}
                  disabled={integrateSoul.isPending}
                  style={{ padding: '5px 12px', fontSize: 11, borderRadius: 6, border: 'none', backgroundColor: 'var(--color-accent)', color: '#fff', cursor: integrateSoul.isPending ? 'default' : 'pointer', opacity: integrateSoul.isPending ? 0.7 : 1, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)' }}
                >
                  {integrateSoul.isPending && (
                    <div style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
                  )}
                  Integrate into Soul
                </button>
              </div>
            )}
            {hasSoulBackup && (
              <button
                onClick={() => revertSoul.mutateAsync()}
                disabled={revertSoul.isPending}
                style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--color-border-default)', backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-muted)', cursor: revertSoul.isPending ? 'default' : 'pointer', opacity: revertSoul.isPending ? 0.6 : 1, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {revertSoul.isPending && (
                  <div style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid var(--color-accent-dim)', borderTopColor: 'var(--color-accent)', animation: 'spin 0.8s linear infinite' }} />
                )}
                Revert
              </button>
            )}
            <button
              onClick={() => refetchSuggestions()}
              disabled={isFetchingSuggestions}
              style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--color-border-default)', backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', cursor: isFetchingSuggestions ? 'default' : 'pointer', opacity: isFetchingSuggestions ? 0.6 : 1, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              {isFetchingSuggestions && (
                <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid var(--color-accent-dim)', borderTopColor: 'var(--color-accent)', animation: 'spin 0.8s linear infinite' }} />
              )}
              {isFetchingSuggestions ? 'Loading...' : 'Refresh'}
            </button>
          </>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {previewSoul ? (
          /* Preview mode: diff view */
          <ReactDiffViewer
            oldValue={soul}
            newValue={previewSoul}
            splitView={false}
            compareMethod={DiffMethod.WORDS}
            useDarkTheme
            styles={{
              variables: {
                dark: {
                  diffViewerBackground: 'var(--color-surface-1)',
                  addedBackground: 'rgba(34,197,94,0.12)',
                  addedColor: '#86efac',
                  removedBackground: 'rgba(239,68,68,0.12)',
                  removedColor: '#fca5a5',
                  wordAddedBackground: 'rgba(34,197,94,0.3)',
                  wordRemovedBackground: 'rgba(239,68,68,0.3)',
                  codeFoldBackground: 'var(--color-surface-2)',
                  codeFoldGutterBackground: 'var(--color-surface-2)',
                },
              },
              contentText: { fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '1.6' },
              gutter: { minWidth: 36 },
            }}
          />
        ) : suggestions.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '24px 0' }}>
            {isFetchingSuggestions ? 'Generating suggestions...' : 'No suggestions yet. Run a consolidation to generate them.'}
          </div>
        ) : (
          suggestions.map(s => {
            const isSelected = selected.has(s.id);
            const isIncorporated = incorporated.has(s.title);
            return (
              <div
                key={s.id}
                onClick={() => toggleSelect(s.id)}
                style={{
                  border: `1px solid ${isSelected ? 'var(--color-accent)' : isIncorporated ? 'rgba(16,185,129,0.25)' : 'var(--color-border-subtle)'}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--color-accent-glow)' : isIncorporated ? 'rgba(16,185,129,0.05)' : 'var(--color-surface-1)',
                  transition: 'border-color 150ms, background-color 150ms',
                  display: 'flex',
                  gap: 12,
                  opacity: isIncorporated && !isSelected ? 0.65 : 1,
                }}
              >
                <div style={{ flexShrink: 0, marginTop: 2 }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 4,
                    border: `1.5px solid ${isSelected ? 'var(--color-accent)' : isIncorporated ? 'rgba(16,185,129,0.5)' : 'var(--color-border-default)'}`,
                    backgroundColor: isSelected ? 'var(--color-accent)' : isIncorporated ? 'rgba(16,185,129,0.2)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 150ms',
                  }}>
                    {isSelected ? (
                      <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isIncorporated ? (
                      <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="rgba(16,185,129,0.9)" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : null}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isIncorporated && (
                    <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(16,185,129,0.8)', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', padding: '1px 6px', borderRadius: 99 }}>
                        ✓ incorporated
                      </span>
                    </div>
                  )}
                  <div className="prose prose-invert prose-sm max-w-none prose-p:text-gray-400 prose-strong:text-gray-200 prose-headings:text-gray-200 prose-li:text-gray-400 prose-a:text-indigo-400 [&_li::marker]:content-none">
                    <Markdown remarkPlugins={[remarkGfm]}>{s.content}</Markdown>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}

type ActiveTab = 'knowledge' | 'channels' | 'inbox' | 'session' | 'soul';

const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'knowledge',
    label: 'Knowledge',
    icon: (
      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'channels',
    label: 'Channels',
    icon: (
      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
      </svg>
    ),
  },
  {
    id: 'inbox',
    label: 'Inbox',
    icon: (
      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    ),
  },
  {
    id: 'session',
    label: 'Session',
    icon: (
      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'soul',
    label: 'Soul',
    icon: (
      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
];

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading, error } = useAgent(id!);
  const deleteAgent = useDeleteAgent();
  const [viewMode, setViewMode] = useState<'chat' | 'manage'>('chat');
  const [showIngest, setShowIngest] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('knowledge');
  const [newHandle, setNewHandle] = useState('');
  const [msg, setMsg] = useState('');

  const triggerRun = useTriggerRun(id!);
  const updateConfig = useUpdateConfig(id!);
  const triggerReevaluation = useTriggerReevaluation(id!);
  const triggerCollection = useTriggerCollection(id!);
  const triggerFactCheck = useTriggerFactCheck(id!);
  const resetSourceStatus = useResetSourceStatus(id!);
  const { data: jobs } = useJobs();
  const { data: suggestionsData, refetch: refetchSuggestions, isFetching: isFetchingSuggestions } = useSoulSuggestions(id!);

  const agentJobs = useMemo(() => jobs?.filter(j => j.id.startsWith(id!)) ?? [], [jobs, id]);
  const nextJob = agentJobs.find(j => j.next_run_time);
  const channels = agent?.sources.youtube_channels ?? [];


  const { data: discoveredData } = useDiscoveredSources(id!);
  const discoveredHandles = useMemo(
    () => parseDiscoveredHandles(discoveredData?.content ?? '', agent?.last_consolidation ?? null),
    [discoveredData?.content, agent?.last_consolidation],
  );

  const act = async (fn: () => Promise<unknown>, label: string) => {
    setMsg('');
    try { await fn(); setMsg(label); }
    catch (e) { setMsg('Error: ' + (e as Error).message); }
  };

  const handleCollect = (handle: string) => act(() => triggerCollection.mutateAsync(handle), `Collecting ${handle}...`);
  const handleFactCheck = (handle: string) => act(() => triggerFactCheck.mutateAsync(handle), `Fact-checking ${handle}...`);
  const handleResetSource = (handle: string) => act(() => resetSourceStatus.mutateAsync(handle), `Reactivated ${handle}.`);

  const handleAddChannel = async () => {
    const handle = newHandle.trim();
    if (!handle) return;
    await act(
      () => updateConfig.mutateAsync({ sources: { youtube_channels: [...channels, { handle }] } }),
      `Added ${handle}.`,
    );
    setNewHandle('');
  };
  const handleRemoveChannel = (handle: string) =>
    act(
      () => updateConfig.mutateAsync({ sources: { youtube_channels: channels.filter(ch => ch.handle !== handle) } }),
      `Removed ${handle}.`,
    );

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--color-accent-dim)', borderTopColor: 'var(--color-accent)', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: 13 }}>Loading...</span>
      </div>
    </div>
  );
  if (error) return <div style={{ color: 'var(--color-status-error)', padding: 24, fontSize: 13 }}>Error: {(error as Error).message}</div>;
  if (!agent) return null;

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent.agent_id}"?`)) return;
    await deleteAgent.mutateAsync(agent.agent_id);
    navigate('/');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── CHAT MODE ── fullscreen with floating pill header */}
      {viewMode === 'chat' && (
        <div style={{ flex: 1, minHeight: 0, position: 'relative', backgroundColor: 'var(--color-surface-0)', overflow: 'hidden' }}>
          {/* Radial blue glow from center-bottom */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse 90% 55% at 50% 110%, rgba(79,127,255,0.10) 0%, transparent 65%)' }} />

          {/* Floating centered pill header */}
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10, backgroundColor: 'rgba(13,13,15,0.85)', backdropFilter: 'blur(12px)', border: '1px solid var(--color-border-subtle)', borderRadius: 14, padding: '10px 20px 10px 14px', display: 'flex', alignItems: 'center', gap: 20, whiteSpace: 'nowrap' }}>
            {/* Avatar */}
            <div style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: 'var(--color-accent-glow)', border: '1px solid var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase' }}>{agent.agent_id[0]}</span>
            </div>
            {/* Name + meta */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>{agent.agent_id}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-3)', padding: '1px 6px', borderRadius: 4 }}>{agent.model}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>·</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{channels.length} channels</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>·</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-status-ok)' }} />
                  <span style={{ fontSize: 11, color: 'var(--color-status-ok)' }}>Online</span>
                </div>
              </div>
            </div>
            {/* Separator + action buttons: invisible placeholders to match manage header width exactly */}
            <div style={{ width: 1, height: 28, backgroundColor: 'var(--color-border-subtle)', flexShrink: 0, visibility: 'hidden' }} />
            <button disabled style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8, border: '1px solid var(--color-border-default)', display: 'flex', alignItems: 'center', gap: 5, visibility: 'hidden', pointerEvents: 'none' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" /><span>Reevaluate</span>
            </button>
            <button disabled style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', display: 'flex', alignItems: 'center', gap: 5, visibility: 'hidden', pointerEvents: 'none' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" /><span>Run Now</span>
            </button>
            {/* Separator */}
            <div style={{ width: 1, height: 28, backgroundColor: 'var(--color-border-subtle)', flexShrink: 0 }} />
            {/* Chat / Manage toggle */}
            <div style={{ display: 'flex', backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-border-default)', borderRadius: 8, padding: 2 }}>
              {(['chat', 'manage'] as const).map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', backgroundColor: viewMode === mode ? 'var(--color-surface-0)' : 'transparent', color: viewMode === mode ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', transition: 'all 150ms', textTransform: 'capitalize' }}>
                  {mode}
                </button>
              ))}
            </div>
            {/* Liquidate */}
            <button
              onClick={handleDelete}
              title="Liquidate Agent"
              style={{ padding: '6px 10px', fontSize: 12, fontWeight: 500, borderRadius: 8, cursor: 'pointer', backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--color-status-error)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>

          {/* ChatPanel fills full height; its own paddingTop clears the floating header */}
          <div style={{ height: '100%', position: 'relative', zIndex: 1 }}>
            <ChatPanel agentId={agent.agent_id} soul={agent.soul} />
          </div>
        </div>
      )}

      {/* ── MANAGE MODE ── floating pill header (same as chat, plus Reevaluate + Run Now) */}
      {viewMode === 'manage' && (
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>

          {/* Floating centered pill header */}
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10, backgroundColor: 'rgba(13,13,15,0.85)', backdropFilter: 'blur(12px)', border: '1px solid var(--color-border-subtle)', borderRadius: 14, padding: '10px 20px 10px 14px', display: 'flex', alignItems: 'center', gap: 20, whiteSpace: 'nowrap' }}>
            {/* Avatar */}
            <div style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: 'var(--color-accent-glow)', border: '1px solid var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase' }}>{agent.agent_id[0]}</span>
            </div>
            {/* Name + meta */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>{agent.agent_id}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-3)', padding: '1px 6px', borderRadius: 4 }}>{agent.model}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>·</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{channels.length} channels</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>·</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-status-ok)' }} />
                  <span style={{ fontSize: 11, color: 'var(--color-status-ok)' }}>Active</span>
                </div>
              </div>
            </div>
            {/* Separator */}
            <div style={{ width: 1, height: 28, backgroundColor: 'var(--color-border-subtle)', flexShrink: 0 }} />
            {/* Reevaluate */}
            <button
              onClick={() => act(() => triggerReevaluation.mutateAsync(), 'Reevaluation triggered.')}
              disabled={triggerReevaluation.isPending}
              style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8, cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-default)', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Reevaluate
            </button>
            {/* Run Now */}
            <button
              onClick={() => act(() => triggerRun.mutateAsync(), 'Run triggered.')}
              disabled={triggerRun.isPending}
              style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', backgroundColor: 'var(--color-accent)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Run Now
            </button>
            {/* Separator */}
            <div style={{ width: 1, height: 28, backgroundColor: 'var(--color-border-subtle)', flexShrink: 0 }} />
            {/* Chat / Manage toggle */}
            <div style={{ display: 'flex', backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-border-default)', borderRadius: 8, padding: 2 }}>
              {(['chat', 'manage'] as const).map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', backgroundColor: viewMode === mode ? 'var(--color-surface-0)' : 'transparent', color: viewMode === mode ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', transition: 'all 150ms', textTransform: 'capitalize' }}>
                  {mode}
                </button>
              ))}
            </div>
            {/* Liquidate */}
            <button
              onClick={handleDelete}
              title="Liquidate Agent"
              style={{ padding: '6px 10px', fontSize: 12, fontWeight: 500, borderRadius: 8, cursor: 'pointer', backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--color-status-error)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>

          {/* Action feedback — floats just below the pill */}
          {msg && (
            <div style={{ position: 'absolute', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 9, padding: '5px 14px', fontSize: 11, borderRadius: 99, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', color: msg.startsWith('Error') ? 'var(--color-status-error)' : 'var(--color-status-ok)', backgroundColor: msg.startsWith('Error') ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)', border: `1px solid ${msg.startsWith('Error') ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}` }}>
              {msg}
            </div>
          )}

          {/* Manage content — spacer reserves room for floating header */}
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 72, flexShrink: 0 }} />
            <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

          {/* Left: fill-height layout */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Stat cards */}
            <div style={{ padding: '20px 32px 16px', flexShrink: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <button
                  onClick={() => setActiveTab('inbox')}
                  style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', width: '100%', border: agent.inbox_count > 0 ? '1px solid rgba(245,158,11,0.3)' : '1px solid var(--color-border-subtle)' }}
                >
                  <div style={monoLabel}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                    Pending Inbox
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 600, color: agent.inbox_count > 0 ? 'var(--color-status-warn)' : 'var(--color-text-primary)', lineHeight: 1, marginTop: 8 }}>
                    {agent.inbox_count}
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', fontWeight: 400, marginLeft: 6 }}>items waiting</span>
                  </div>
                </button>

                <div style={cardStyle}>
                  <div style={monoLabel}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Knowledge Base
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1, marginTop: 8 }}>
                    {agent.knowledge_count}
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', fontWeight: 400, marginLeft: 6 }}>indexed files</span>
                  </div>
                </div>

                <div style={cardStyle}>
                  <div style={monoLabel}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Last Consolidation
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.4, marginTop: 8, fontFamily: 'var(--font-mono)' }}>
                    {agent.last_consolidation
                      ? new Date(agent.last_consolidation).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                      : 'Never'}
                  </div>
                </div>

                <div style={cardStyle}>
                  <div style={monoLabel}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Next Scheduled
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.4, marginTop: 8, fontFamily: 'var(--font-mono)' }}>
                    {nextJob?.next_run_time
                      ? new Date(nextJob.next_run_time).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                      : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Tab content area — fills remaining height */}
            <div style={{ flex: 1, minHeight: 0, padding: '0 32px 24px', display: 'flex', flexDirection: 'column' }}>
              {/* Tab container with border */}
              <div style={{ flex: 1, minHeight: 0, border: '1px solid var(--color-border-subtle)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                {/* Tab bar */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0, padding: '0 6px', backgroundColor: 'var(--color-surface-2)' }}>
                  {TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '11px 16px',
                        fontSize: 12,
                        fontWeight: activeTab === tab.id ? 600 : 400,
                        letterSpacing: '0.01em',
                        border: 'none',
                        borderBottom: activeTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
                        marginBottom: -1,
                        cursor: 'pointer',
                        backgroundColor: 'transparent',
                        color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                        transition: 'all 150ms',
                      }}
                    >
                      {tab.icon}
                      {tab.label}
                      {tab.id === 'inbox' && agent.inbox_count > 0 && (
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-status-warn)', backgroundColor: 'rgba(234,179,8,0.15)', padding: '1px 5px', borderRadius: 99, lineHeight: 1.4 }}>{agent.inbox_count}</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Knowledge tab */}
                {activeTab === 'knowledge' && (
                  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <KnowledgeBrowser agentId={agent.agent_id} />
                  </div>
                )}

                {/* Channels tab */}
                {activeTab === 'channels' && (
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                    {/* Add channel row */}
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <input
                        type="text"
                        value={newHandle}
                        onChange={e => setNewHandle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddChannel(); }}
                        placeholder="@ChannelHandle"
                        style={{ flex: 1, backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-default)', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', outline: 'none' }}
                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
                      />
                      <button
                        onClick={handleAddChannel}
                        disabled={!newHandle.trim() || updateConfig.isPending}
                        style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', backgroundColor: 'var(--color-accent)', color: '#fff', cursor: newHandle.trim() ? 'pointer' : 'default', opacity: newHandle.trim() ? 1 : 0.4, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
                      >
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                        Add Channel
                      </button>
                    </div>

                    {/* Channel cards */}
                    {channels.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8, color: 'var(--color-text-muted)', paddingTop: 40 }}>
                        <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ opacity: 0.4 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                        </svg>
                        <span style={{ fontSize: 13 }}>No channels yet. Add one above.</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {channels.map(ch => {
                          const handle = ch.handle;
                          const stats = agent.source_stats?.[handle];
                          const lastChecked = agent.last_checked?.[handle];
                          const status = stats?.status ?? 'active';
                          const scores = stats?.scores ?? [];
                          const avgScore = scores.length
                            ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(2)
                            : null;
                          const isDiscovered = discoveredHandles.has(handle);

                          const statusColor =
                            status === 'active' ? 'var(--color-status-ok)' :
                            status === 'flagged' ? 'var(--color-status-error)' :
                            'var(--color-text-muted)';
                          const statusBg =
                            status === 'active' ? 'rgba(16,185,129,0.1)' :
                            status === 'flagged' ? 'rgba(239,68,68,0.1)' :
                            'rgba(107,114,128,0.1)';

                          return (
                            <div
                              key={handle}
                              style={{
                                backgroundColor: isDiscovered ? 'var(--color-accent-glow)' : 'var(--color-surface-2)',
                                border: isDiscovered ? '1px solid var(--color-accent-dim)' : '1px solid var(--color-border-subtle)',
                                borderLeft: `3px solid ${statusColor}`,
                                borderRadius: 8,
                                padding: '10px 14px',
                                display: 'flex', flexDirection: 'column', gap: 8,
                              }}
                            >
                              {/* Row 1: handle + badges + remove */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#ff0000', flexShrink: 0 }}>
                                    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                                  </svg>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{handle}</span>
                                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: statusColor, backgroundColor: statusBg, padding: '1px 7px', borderRadius: 99, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>{status}</span>
                                  {isDiscovered && (
                                    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', border: '1px solid var(--color-accent-dim)', padding: '1px 7px', borderRadius: 99, fontWeight: 600, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 3 }}>
                                      <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                      ai discovered
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleRemoveChannel(handle)}
                                  title="Remove channel"
                                  style={{ padding: '2px 6px', fontSize: 14, borderRadius: 4, border: 'none', backgroundColor: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
                                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-status-error)')}
                                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                                >
                                  ×
                                </button>
                              </div>

                              {stats?.flagged_reason && (
                                <div style={{ fontSize: 11, color: 'var(--color-status-error)', backgroundColor: 'rgba(239,68,68,0.08)', padding: '6px 10px', borderRadius: 5, border: '1px solid rgba(239,68,68,0.2)', lineHeight: 1.5 }}>
                                  {stats.flagged_reason}
                                </div>
                              )}

                              {/* Row 2: meta + actions */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <div style={monoLabel}>
                                  {lastChecked
                                    ? `checked ${new Date(lastChecked).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                                    : 'never checked'}
                                  {avgScore && (
                                    <span style={{ marginLeft: 6, color: 'var(--color-text-secondary)' }}>· avg {avgScore}</span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
                                  <button
                                    onClick={() => handleCollect(handle)}
                                    style={{ padding: '3px 10px', fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-mono)', borderRadius: 5, border: '1px solid var(--color-border-default)', backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, letterSpacing: '0.02em' }}
                                  >
                                    <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    collect
                                  </button>
                                  {status === 'flagged' && (
                                    <>
                                      <button
                                        onClick={() => handleFactCheck(handle)}
                                        style={{ padding: '3px 10px', fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-mono)', borderRadius: 5, border: '1px solid rgba(234,179,8,0.3)', backgroundColor: 'rgba(234,179,8,0.08)', color: 'var(--color-status-warn)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                      >
                                        <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        fact-check
                                      </button>
                                      <button
                                        onClick={() => handleResetSource(handle)}
                                        style={{ padding: '3px 10px', fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-mono)', borderRadius: 5, border: '1px solid rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.08)', color: 'var(--color-status-ok)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                      >
                                        <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        reactivate
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Inbox tab */}
                {activeTab === 'inbox' && (
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px' }}>
                    <InboxPanel agentId={agent.agent_id} />
                  </div>
                )}

                {/* Session tab */}
                {activeTab === 'session' && (
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 20 }}>
                    <SessionPanel agentId={agent.agent_id} />
                  </div>
                )}

                {/* Soul tab */}
                {activeTab === 'soul' && (
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <SoulEvolutionTab
                      agentId={agent.agent_id}
                      soul={agent.soul}
                      hasSoulBackup={agent.has_soul_backup}
                      suggestionsData={suggestionsData}
                      refetchSuggestions={refetchSuggestions}
                      isFetchingSuggestions={isFetchingSuggestions}
                    />
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* Right: Inspector (collapsible) */}
          <aside style={{
            width: inspectorOpen ? 360 : 40,
            flexShrink: 0,
            borderLeft: '1px solid var(--color-border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: 'var(--color-surface-1)',
            transition: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}>
            {/* Header / toggle */}
            <div style={{
              flexShrink: 0,
              padding: inspectorOpen ? '12px 20px' : '12px 0',
              borderBottom: '1px solid var(--color-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: 'rgba(18,18,22,0.96)',
              backdropFilter: 'blur(8px)',
              zIndex: 10,
              justifyContent: inspectorOpen ? 'flex-start' : 'center',
              position: 'sticky',
              top: 0,
            }}>
              {inspectorOpen ? (
                <>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', flex: 1 }}>Agent Inspector</span>
                  <button
                    onClick={() => setInspectorOpen(false)}
                    title="Collapse Inspector"
                    style={{ padding: 4, borderRadius: 4, border: 'none', backgroundColor: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setInspectorOpen(true)}
                  title="Expand Inspector"
                  style={{ padding: 6, borderRadius: 4, border: 'none', backgroundColor: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                </button>
              )}
            </div>

            {/* Scrollable content */}
            {inspectorOpen && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <Section title="Core Identity (Soul)">
                  <SoulEditor agentId={agent.agent_id} initialSoul={agent.soul} />
                </Section>
                <Section title="Configuration" defaultOpen={false}>
                  <AgentForm agent={agent} />
                </Section>
              </div>
            )}
          </aside>
        </div>
          </div>
        </div>
      )}

      {/* Ingest FAB + slide-overs */}
      {viewMode === 'manage' && (
        <>
          <button
            onClick={() => setShowIngest(v => !v)}
            style={{ position: 'fixed', bottom: 32, right: inspectorOpen ? 32 + 360 + 12 : 32 + 40 + 12, transition: 'right 250ms cubic-bezier(0.4, 0, 0.2, 1)', zIndex: 50, width: 48, height: 48, borderRadius: 12, backgroundColor: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px var(--color-accent-glow)' }}
          >
            {showIngest
              ? <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              : <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            }
          </button>

          {showIngest && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end', backgroundColor: 'rgba(8,8,9,0.7)' }} onClick={e => { if (e.target === e.currentTarget) setShowIngest(false); }}>
              <div style={{ width: '100%', maxWidth: 420, height: '100%', padding: 24, overflowY: 'auto', backgroundColor: 'var(--color-surface-1)', borderLeft: '1px solid var(--color-border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>Feed Knowledge</h3>
                  <button onClick={() => setShowIngest(false)} style={{ padding: 6, borderRadius: 6, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--color-text-muted)' }}>
                    <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <IngestPanel agent={agent} />
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}
