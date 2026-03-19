import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAgent, useDeleteAgent, useUpdateConfig } from '../api/agents';
import {
  useTriggerRun, useTriggerReevaluation, useTriggerCollection,
  useTriggerConsolidation, useTriggerScan,
  useTriggerFactCheck, useResetSourceStatus, useJobs, useSoulSuggestions,
  useDiscoveredSources,
} from '../api/scheduler';
import KnowledgeBrowser from './KnowledgeBrowser';
import SoulTab from './SoulTab';
import ConfigSidebar from './ConfigSidebar';
import SkillTab from './SkillTab';
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


/** Returns the set of source IDs discovered by self-improvement after `since`. */
function parseDiscoveredSourceIds(content: string, since: string | null): Set<string> {
  const result = new Set<string>();
  const blocks = content.split(/^## /m).slice(1);
  for (const block of blocks) {
    const tsLine = block.match(/^([^\n]+)/);
    const idLine = block.match(/\*\*Source ID:\*\*\s*(\S+)/);
    if (!tsLine || !idLine) continue;
    if (since && new Date(tsLine[1].trim()) <= new Date(since)) continue;
    result.add(idLine[1]);
  }
  return result;
}

type ActiveTab = 'knowledge' | 'skill' | 'channels' | 'inbox' | 'session' | 'soul';

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
    id: 'skill',
    label: 'Skill',
    icon: (
      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: 'channels',
    label: 'Sources',
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('knowledge');
  const [newSourceType, setNewSourceType] = useState<'youtube' | 'medium' | 'web_page' | 'reddit'>('youtube');
  const [newHandle, setNewHandle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newSubreddit, setNewSubreddit] = useState('');
  const [newMinScore, setNewMinScore] = useState(50);
  const [msg, setMsg] = useState('');
  const [scanDialog, setScanDialog] = useState<{ handle: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const triggerRun = useTriggerRun(id!);
  const updateConfig = useUpdateConfig(id!);
  const triggerReevaluation = useTriggerReevaluation(id!);
  const triggerCollection = useTriggerCollection(id!);
  const triggerConsolidation = useTriggerConsolidation(id!);
  const triggerScan = useTriggerScan(id!);
  const triggerFactCheck = useTriggerFactCheck(id!);
  const resetSourceStatus = useResetSourceStatus(id!);
  const { data: jobs } = useJobs();
  const { data: suggestionsData, refetch: refetchSuggestions, isFetching: isFetchingSuggestions } = useSoulSuggestions(id!);

  const agentJobs = useMemo(() => jobs?.filter(j => j.id.startsWith(id!)) ?? [], [jobs, id]);
  const nextJob = agentJobs.find(j => j.next_run_time);
  const sources = agent?.sources ?? [];

  function getSourceId(s: { type: string; [key: string]: unknown }): string {
    switch (s.type) {
      case 'youtube': return s.handle as string;
      case 'medium': return `medium:${s.handle}`;
      case 'web_page': return s.url as string;
      case 'reddit': return `reddit:r/${s.subreddit}`;
      default: return String(s.handle || s.url || s.type);
    }
  }


  const { data: discoveredData } = useDiscoveredSources(id!);
  const discoveredSourceIds = useMemo(
    () => parseDiscoveredSourceIds(discoveredData?.content ?? '', agent?.last_consolidation ?? null),
    [discoveredData?.content, agent?.last_consolidation],
  );

  const act = async (fn: () => Promise<unknown>, label: string) => {
    setMsg('');
    try { await fn(); setMsg(label); }
    catch (e) { setMsg('Error: ' + (e as Error).message); }
  };

  const handleCollect = (sourceId: string) => act(() => triggerCollection.mutateAsync(sourceId), `Collecting ${sourceId}...`);
  const handleFactCheck = (sourceId: string) => act(() => triggerFactCheck.mutateAsync(sourceId), `Fact-checking ${sourceId}...`);
  const handleResetSource = (sourceId: string) => act(() => resetSourceStatus.mutateAsync(sourceId), `Reactivated ${sourceId}.`);

  const handleAddSource = async () => {
    const entry: { type: string; [key: string]: unknown } = { type: newSourceType };
    if (newSourceType === 'youtube' || newSourceType === 'medium') {
      if (!newHandle.trim()) return;
      entry.handle = newHandle.trim();
    } else if (newSourceType === 'web_page') {
      if (!newUrl.trim()) return;
      entry.url = newUrl.trim();
    } else if (newSourceType === 'reddit') {
      if (!newSubreddit.trim()) return;
      entry.subreddit = newSubreddit.trim();
      entry.min_score = newMinScore;
    }
    await act(
      () => updateConfig.mutateAsync({ sources: [...sources, entry] }),
      `Added ${newSourceType} source.`,
    );
    setNewHandle('');
    setNewUrl('');
    setNewSubreddit('');
  };
  const handleRemoveSource = (sourceId: string) =>
    act(
      () => updateConfig.mutateAsync({ sources: sources.filter(s => getSourceId(s) !== sourceId) }),
      `Removed ${sourceId}.`,
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
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{sources.length} sources</span>
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
            <button disabled style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8, border: '1px solid var(--color-border-default)', display: 'flex', alignItems: 'center', gap: 5, visibility: 'hidden', pointerEvents: 'none' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" /><span>Consolidate Now</span>
            </button>
            <button disabled style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', display: 'flex', alignItems: 'center', gap: 5, visibility: 'hidden', pointerEvents: 'none' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" /><span>Run Now</span>
            </button>
            <button disabled style={{ padding: '5px 8px', fontSize: 11, borderRadius: 7, border: '1px solid transparent', visibility: 'hidden', pointerEvents: 'none' }}>?</button>
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

          {/* ChatPanel — centered column, clears floating header via its own paddingTop */}
          <div style={{ height: '100%', position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: 820 }}>
              <ChatPanel agentId={agent.agent_id} soul={agent.soul} />
            </div>
          </div>
        </div>
      )}

      {/* Scan history dialog */}
      {scanDialog && (
        <div
          onClick={() => setScanDialog(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-border-default)', borderRadius: 12, padding: 24, width: 300, display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>Scan Channel History</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>{scanDialog.handle}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>How many videos?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {([{ label: '10 videos', value: 10 }, { label: '50 videos', value: 50 }, { label: '100 videos', value: 100 }, { label: 'All videos', value: null }] as const).map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => {
                    setScanDialog(null);
                    act(() => triggerScan.mutateAsync({ handle: scanDialog.handle, limit: value }), `Scanning ${label} from ${scanDialog.handle}...`);
                  }}
                  style={{ padding: '8px 12px', fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-mono)', borderRadius: 7, border: '1px solid var(--color-border-default)', backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setScanDialog(null)}
              style={{ padding: '6px 12px', fontSize: 12, borderRadius: 7, border: '1px solid var(--color-border-subtle)', backgroundColor: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── MANAGE MODE ── floating pill header (same as chat, plus Reevaluate + Run Now) */}
      {viewMode === 'manage' && (
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>

          {/* Help reference panel */}
          {showHelp && (
            <div style={{ position: 'absolute', top: 84, left: '50%', transform: 'translateX(-50%)', zIndex: 9, backgroundColor: 'rgba(13,13,15,0.94)', backdropFilter: 'blur(14px)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, padding: '18px 20px', width: 460, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-text-muted)', fontWeight: 600 }}>Pipeline Actions</div>
              {([
                { icon: '↻', name: 'Reevaluate', color: 'var(--color-text-secondary)', desc: 'Re-score all knowledge files using the current soul. Run after editing the soul to reprioritize what the agent has already learned.' },
                { icon: '◎', name: 'Consolidate Now', color: agent.inbox_count ? 'var(--color-status-warn)' : 'var(--color-text-secondary)', desc: 'Process all pending inbox items into the knowledge base, then regenerate digest.md and SKILL.md.' },
                { icon: '▶', name: 'Run Now', color: 'var(--color-accent)', desc: 'Full daily pipeline: collect new videos from all channels → consolidate into knowledge → self-improving research (if enabled).' },
              ] as const).map(({ icon, name, color, desc }) => (
                <div key={name} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color, flexShrink: 0, width: 16, textAlign: 'center', marginTop: 1 }}>{icon}</span>
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color, letterSpacing: '0.02em' }}>{name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 8, lineHeight: 1.5 }}>{desc}</span>
                  </div>
                </div>
              ))}
              <div style={{ height: 1, backgroundColor: 'var(--color-border-subtle)', margin: '2px 0' }} />
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-text-muted)', fontWeight: 600 }}>Channel Actions</div>
              {([
                { icon: '⌕', name: 'scan history', color: 'var(--color-status-warn)', desc: "Scan the channel's full video history against your soul. Relevant videos are added to inbox. Does not auto-consolidate." },
                { icon: '↓', name: 'collect', color: 'var(--color-text-secondary)', desc: 'Fetch the latest new videos from this channel and analyze against the soul. Results go to inbox. Does not auto-consolidate.' },
                { icon: '✓', name: 'fact-check', color: 'var(--color-text-secondary)', desc: 'Re-evaluate source credibility. Clears the flagged status if the channel passes the quality check.' },
                { icon: '↺', name: 'reactivate', color: 'var(--color-status-ok)', desc: 'Remove a paused or flagged status and resume collecting from this channel.' },
              ] as const).map(({ icon, name, color, desc }) => (
                <div key={name} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color, flexShrink: 0, width: 16, textAlign: 'center', marginTop: 1 }}>{icon}</span>
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color, letterSpacing: '0.02em' }}>{name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 8, lineHeight: 1.5 }}>{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

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
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{sources.length} sources</span>
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
              title="Re-score all knowledge files using the current soul. Run after editing the soul to reprioritize what the agent has already learned."
              style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8, cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-default)', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Reevaluate
            </button>
            {/* Consolidate Now */}
            <button
              onClick={() => act(() => triggerConsolidation.mutateAsync(), 'Consolidation triggered.')}
              disabled={triggerConsolidation.isPending}
              title="Process all pending inbox items into the knowledge base, then regenerate digest.md and SKILL.md."
              style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8, cursor: 'pointer', backgroundColor: agent?.inbox_count ? 'rgba(234,179,8,0.12)' : 'transparent', color: agent?.inbox_count ? 'var(--color-status-warn)' : 'var(--color-text-secondary)', border: agent?.inbox_count ? '1px solid rgba(234,179,8,0.35)' : '1px solid var(--color-border-default)', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
              Consolidate Now
              {!!agent?.inbox_count && (
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-status-warn)', backgroundColor: 'rgba(234,179,8,0.2)', padding: '0px 5px', borderRadius: 99, lineHeight: 1.6 }}>{agent.inbox_count}</span>
              )}
            </button>
            {/* Run Now */}
            <button
              onClick={() => act(() => triggerRun.mutateAsync(), 'Run triggered.')}
              disabled={triggerRun.isPending}
              title="Full daily pipeline: collect new videos from all channels → consolidate into knowledge → self-improving research (if enabled)."
              style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', backgroundColor: 'var(--color-accent)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Run Now
            </button>
            {/* Feed Knowledge */}
            <button
              onClick={() => setShowIngest(v => !v)}
              title="Manually feed a document, URL, or text directly into the inbox."
              style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8, cursor: 'pointer', backgroundColor: showIngest ? 'rgba(79,127,255,0.15)' : 'transparent', color: showIngest ? 'var(--color-accent)' : 'var(--color-text-secondary)', border: showIngest ? '1px solid var(--color-accent-dim)' : '1px solid var(--color-border-default)', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              Ingest
            </button>
            {/* Help toggle */}
            <button
              onClick={() => setShowHelp(h => !h)}
              title="Show action reference"
              style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, borderRadius: 7, border: '1px solid var(--color-border-subtle)', backgroundColor: showHelp ? 'var(--color-surface-3)' : 'transparent', color: showHelp ? 'var(--color-text-secondary)' : 'var(--color-text-muted)', cursor: 'pointer', lineHeight: 1 }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
              onMouseLeave={e => { if (!showHelp) e.currentTarget.style.color = 'var(--color-text-muted)'; }}
            >
              ?
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

                {/* Skill tab */}
                {activeTab === 'skill' && (
                  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <SkillTab agentId={agent.agent_id} />
                  </div>
                )}

                {/* Sources tab */}
                {activeTab === 'channels' && (
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                    {/* Add source form */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                          value={newSourceType}
                          onChange={e => setNewSourceType(e.target.value as typeof newSourceType)}
                          style={{ backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-border-default)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', cursor: 'pointer', flexShrink: 0 }}
                        >
                          <option value="youtube">YouTube</option>
                          <option value="medium">Medium</option>
                          <option value="web_page">Web Page</option>
                          <option value="reddit">Reddit</option>
                        </select>
                        {(newSourceType === 'youtube' || newSourceType === 'medium') && (
                          <input type="text" value={newHandle} onChange={e => setNewHandle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddSource(); }}
                            placeholder={newSourceType === 'youtube' ? '@ChannelHandle' : '@author'}
                            style={{ flex: 1, backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-border-default)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', outline: 'none' }}
                          />
                        )}
                        {newSourceType === 'web_page' && (
                          <input type="text" value={newUrl} onChange={e => setNewUrl(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddSource(); }}
                            placeholder="https://example.com/page"
                            style={{ flex: 1, backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-border-default)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', outline: 'none' }}
                          />
                        )}
                        {newSourceType === 'reddit' && (
                          <>
                            <input type="text" value={newSubreddit} onChange={e => setNewSubreddit(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleAddSource(); }}
                              placeholder="MachineLearning"
                              style={{ flex: 1, backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-border-default)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', outline: 'none' }}
                            />
                            <input type="number" value={newMinScore} onChange={e => setNewMinScore(Number(e.target.value))}
                              placeholder="min score"
                              style={{ width: 80, backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-border-default)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', outline: 'none' }}
                            />
                          </>
                        )}
                        <button
                          onClick={handleAddSource}
                          disabled={updateConfig.isPending}
                          style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', backgroundColor: 'var(--color-accent)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
                        >
                          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Source cards */}
                    {sources.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8, color: 'var(--color-text-muted)', paddingTop: 40 }}>
                        <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ opacity: 0.4 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                        </svg>
                        <span style={{ fontSize: 13 }}>No sources yet. Add one above.</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {sources.map((src) => {
                          const sourceId = getSourceId(src);
                          const stats = agent.source_stats?.[sourceId];
                          const lastChecked = agent.last_checked?.[sourceId];
                          const status = stats?.status ?? 'active';
                          const scores = stats?.scores ?? [];
                          const avgScore = scores.length
                            ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(2)
                            : null;
                          const isDiscovered = discoveredSourceIds.has(getSourceId(src));

                          const statusColor =
                            status === 'active' ? 'var(--color-status-ok)' :
                            status === 'flagged' ? 'var(--color-status-error)' :
                            'var(--color-text-muted)';
                          const statusBg =
                            status === 'active' ? 'rgba(16,185,129,0.1)' :
                            status === 'flagged' ? 'rgba(239,68,68,0.1)' :
                            'rgba(107,114,128,0.1)';

                          const sourceIcon = src.type === 'youtube' ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#ff0000', flexShrink: 0 }}>
                              <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                            </svg>
                          ) : src.type === 'medium' ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                              <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zm7.42 0c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/>
                            </svg>
                          ) : src.type === 'reddit' ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#ff4500', flexShrink: 0 }}>
                              <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
                            </svg>
                          ) : (
                            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                          );

                          const displayLabel = src.type === 'youtube' ? String(src.handle)
                            : src.type === 'medium' ? String(src.handle)
                            : src.type === 'reddit' ? `r/${src.subreddit}`
                            : String(src.url ?? sourceId);

                          return (
                            <div
                              key={sourceId}
                              style={{
                                backgroundColor: isDiscovered ? 'var(--color-accent-glow)' : 'var(--color-surface-2)',
                                border: isDiscovered ? '1px solid var(--color-accent-dim)' : '1px solid var(--color-border-subtle)',
                                borderLeft: `3px solid ${statusColor}`,
                                borderRadius: 8,
                                padding: '10px 14px',
                                display: 'flex', flexDirection: 'column', gap: 8,
                              }}
                            >
                              {/* Row 1: icon + label + type badge + status + remove */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                                  {sourceIcon}
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{displayLabel}</span>
                                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-3)', padding: '1px 6px', borderRadius: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{src.type.replace('_', ' ')}</span>
                                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: statusColor, backgroundColor: statusBg, padding: '1px 7px', borderRadius: 99, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>{status}</span>
                                  {src.type === 'reddit' && Boolean(src.min_score) && (
                                    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-3)', padding: '1px 6px', borderRadius: 4 }}>≥{String(src.min_score)} pts</span>
                                  )}
                                  {isDiscovered && (
                                    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', border: '1px solid var(--color-accent-dim)', padding: '1px 7px', borderRadius: 99, fontWeight: 600, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 3 }}>
                                      <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                      ai discovered
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleRemoveSource(sourceId)}
                                  title="Remove source"
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
                                  {src.type === 'youtube' && (
                                    <button
                                      onClick={() => setScanDialog({ handle: String(src.handle) })}
                                      disabled={triggerScan.isPending}
                                      title="Scan this channel's full video history against your soul."
                                      style={{ padding: '3px 10px', fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-mono)', borderRadius: 5, border: '1px solid rgba(234,179,8,0.3)', backgroundColor: 'rgba(234,179,8,0.08)', color: 'var(--color-status-warn)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, letterSpacing: '0.02em' }}
                                    >
                                      <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                      scan history
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleCollect(sourceId)}
                                    title="Fetch new items from this source and analyze against the soul."
                                    style={{ padding: '3px 10px', fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-mono)', borderRadius: 5, border: '1px solid var(--color-border-default)', backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, letterSpacing: '0.02em' }}
                                  >
                                    <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    collect
                                  </button>
                                  {status === 'flagged' && (
                                    <>
                                      <button
                                        onClick={() => handleFactCheck(sourceId)}
                                        title="Re-evaluate source credibility."
                                        style={{ padding: '3px 10px', fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-mono)', borderRadius: 5, border: '1px solid rgba(234,179,8,0.3)', backgroundColor: 'rgba(234,179,8,0.08)', color: 'var(--color-status-warn)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                      >
                                        <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        fact-check
                                      </button>
                                      <button
                                        onClick={() => handleResetSource(sourceId)}
                                        title="Remove the paused or flagged status and resume collecting."
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
                  <SoulTab
                    key={agent.soul}
                    agentId={agent.agent_id}
                    agent={agent}
                    suggestionsData={suggestionsData}
                    refetchSuggestions={refetchSuggestions}
                    isFetchingSuggestions={isFetchingSuggestions}
                  />
                )}

              </div>
            </div>
          </div>

          {/* Right: Configuration sidebar */}
          <ConfigSidebar key={agent.agent_id} agentId={agent.agent_id} agent={agent} />
        </div>
          </div>
        </div>
      )}

      {/* Ingest slide-over */}
      {viewMode === 'manage' && showIngest && (
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
    </div>
  );
}
