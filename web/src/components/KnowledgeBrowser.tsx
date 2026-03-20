import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useKnowledge, useKnowledgeFile, useSkill, useDigest, useKnowledgeSearch, useSkillQuality, useSkillAudit, useSkills } from '../api/knowledge';
import type { QualityHistoryEntry, PromptEvalResult, StructureIssue, PluginSkill } from '../types';

interface Props {
  agentId: string;
}

const weightColor = (w: number) => {
  if (w >= 0.65) return 'var(--color-accent)';
  if (w >= 0.35) return 'var(--color-status-warn)';
  return 'var(--color-text-muted)';
};

function scoreColor(score: number, alert: boolean): string {
  if (alert) return 'var(--color-status-error)';
  if (score >= 0.75) return 'var(--color-status-ok)';
  return 'var(--color-status-warn)';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Mini bar chart: one bar per prompt, centered at 0, green/red. Tooltip = prompt text. */
function DeltaBars({ results }: { results: PromptEvalResult[] }) {
  const n = results.length;
  if (n === 0) return null;
  const barW = 5, gap = 2, maxH = 14;
  const maxAbs = Math.max(...results.map(r => Math.abs(r.delta)), 0.01);
  const svgW = n * (barW + gap) - gap;
  const svgH = maxH * 2 + 3; // above + below baseline

  return (
    <svg width={svgW} height={svgH} style={{ flexShrink: 0, overflow: 'visible' }}>
      {/* Baseline */}
      <line x1={0} y1={maxH + 1} x2={svgW} y2={maxH + 1}
        stroke="var(--color-border-subtle)" strokeWidth="0.75" />
      {results.map((r, i) => {
        const h = Math.max(1, (Math.abs(r.delta) / maxAbs) * maxH);
        const isPos = r.delta >= 0;
        const x = i * (barW + gap);
        const y = isPos ? maxH + 1 - h : maxH + 2;
        return (
          <rect key={i} x={x} y={y} width={barW} height={h} rx="1"
            fill={isPos ? '#22c55e' : '#ef4444'} opacity="0.75">
            <title>{r.prompt.slice(0, 90)}{r.prompt.length > 90 ? '…' : ''} (Δ{r.delta >= 0 ? '+' : ''}{r.delta.toFixed(2)})</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Full evolution chart with auto-zoomed Y-axis. */
interface EvolutionChartProps {
  history: QualityHistoryEntry[];
  alert: boolean;
  latestScore: number;
}

function EvolutionChart({ history, alert, latestScore }: EvolutionChartProps) {
  const pts = [...history].reverse(); // oldest → newest
  const n = pts.length;
  if (n < 2) return null;

  const W = 480, H = 80, PAD_L = 32, PAD_R = 8, PAD_T = 8, PAD_B = 18;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const scores = pts.map(p => p.score);
  const rawMin = Math.min(...scores);
  const rawMax = Math.max(...scores);
  const margin = Math.max((rawMax - rawMin) * 0.2, 0.01);
  const yMin = Math.max(0, rawMin - margin);
  const yMax = Math.min(1, rawMax + margin);
  const yRange = yMax - yMin || 0.01;

  const toY = (s: number) => PAD_T + (1 - (s - yMin) / yRange) * innerH;
  const xs = pts.map((_, i) => PAD_L + (n > 1 ? (i / (n - 1)) : 0.5) * innerW);
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${toY(pts[i].score).toFixed(1)}`).join(' ');
  const lineColor = scoreColor(latestScore, alert);

  // Meaningful gridlines within visible range
  const gridCandidates = [0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0];
  const gridLines = gridCandidates.filter(v => v > yMin + 0.005 && v < yMax - 0.005);

  // X-axis: show up to 6 date labels
  const labelIdx = n <= 6
    ? pts.map((_, i) => i)
    : [0, ...Array.from({ length: 4 }, (_, k) => Math.round((k + 1) * (n - 1) / 5)), n - 1];
  const uniqueIdx = [...new Set(labelIdx)];

  // Version change ticks
  const versionTicks = pts.reduce<number[]>((acc, p, i) => {
    if (i > 0 && p.skill_version !== pts[i - 1].skill_version) acc.push(i);
    return acc;
  }, []);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      {/* Grid lines */}
      {gridLines.map(v => (
        <g key={v}>
          <line x1={PAD_L} y1={toY(v)} x2={W - PAD_R} y2={toY(v)}
            stroke="var(--color-border-subtle)" strokeWidth="0.5" strokeDasharray="3,3" />
          <text x={PAD_L - 4} y={toY(v) + 3} textAnchor="end"
            fontSize="6.5" fill="var(--color-text-muted)" fontFamily="var(--font-mono)">
            {v.toFixed(2)}
          </text>
        </g>
      ))}
      {/* Version change ticks */}
      {versionTicks.map(i => (
        <line key={i} x1={xs[i]} y1={PAD_T} x2={xs[i]} y2={PAD_T + innerH}
          stroke="rgba(139,92,246,0.45)" strokeWidth="1" strokeDasharray="2,2" />
      ))}
      {/* Line */}
      <path d={d} fill="none" stroke={lineColor} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      {/* Dots */}
      {pts.map((_p, i) => (
        <circle key={i} cx={xs[i]} cy={toY(pts[i].score)} r="2.5"
          fill={lineColor} opacity="0.85" />
      ))}
      {/* X-axis date labels */}
      {uniqueIdx.map(i => (
        <text key={i} x={xs[i]} y={H - 2} textAnchor="middle"
          fontSize="7" fill="var(--color-text-muted)" fontFamily="var(--font-mono)">
          {formatDate(pts[i].timestamp)}
        </text>
      ))}
    </svg>
  );
}

/** Collapsible session row in the history list. */
function SessionRow({ entry, isLatest, alert }: { entry: QualityHistoryEntry; isLatest: boolean; alert: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isRolledBack = !!entry.rollback;
  const rowColor = isRolledBack
    ? 'var(--color-text-disabled)'
    : isLatest && alert
    ? 'var(--color-status-error)'
    : entry.score >= 0.75 ? 'var(--color-status-ok)'
    : entry.score >= 0.5 ? 'var(--color-status-warn)'
    : 'var(--color-status-error)';

  return (
    <div style={{ borderBottom: '1px solid var(--color-border-subtle)', opacity: isRolledBack ? 0.45 : 1 }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 0', background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', minWidth: 56 }}>
          {formatDate(entry.timestamp)}
        </span>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: rowColor, minWidth: 40, textDecoration: isRolledBack ? 'line-through' : 'none' }}>
          {entry.score.toFixed(3)}
        </span>
        <span style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(139,92,246,0.65)',
          backgroundColor: 'rgba(139,92,246,0.07)', padding: '1px 5px', borderRadius: 3,
          border: '1px solid rgba(139,92,246,0.18)',
        }}>
          {entry.skill_version.slice(0, 6)}
        </span>
        {isRolledBack && (
          <span style={{
            fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--color-status-warn)',
            backgroundColor: 'rgba(245,158,11,0.08)', padding: '1px 5px', borderRadius: 3,
            border: '1px solid rgba(245,158,11,0.2)', letterSpacing: '0.04em',
          }}>
            rolled back
          </span>
        )}
        {!isRolledBack && entry.eval_results.length > 0 && (
          <div style={{ marginLeft: 4 }}>
            <DeltaBars results={entry.eval_results} />
          </div>
        )}
        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor"
          style={{ marginLeft: 'auto', color: 'var(--color-text-muted)', flexShrink: 0, transition: 'transform 150ms', transform: expanded ? 'rotate(180deg)' : 'none' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && entry.eval_results.length > 0 && (
        <div style={{ paddingBottom: 10, paddingLeft: 66, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {entry.eval_results.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={r.prompt}>
                {r.prompt.length > 72 ? r.prompt.slice(0, 72) + '…' : r.prompt}
              </span>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: r.delta >= 0 ? 'var(--color-status-ok)' : 'var(--color-status-error)', flexShrink: 0, minWidth: 30, textAlign: 'right' }}>
                {r.delta >= 0 ? '+' : ''}{r.delta.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** History view — renders in the content pane, full height. */
function HistoryView({ history, alert, latestScore, onBack }: {
  history: QualityHistoryEntry[];
  alert: boolean;
  latestScore: number;
  onBack: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', background: 'transparent', border: '1px solid var(--color-border-subtle)', borderRadius: 5, cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)' }}>
          Quality Evolution
        </span>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
          {history.length} session{history.length !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(139,92,246,0.6)', marginLeft: 2 }}>
          — skill version change
        </span>
      </div>

      {/* Chart */}
      {history.length > 1 ? (
        <div style={{ flexShrink: 0, marginBottom: 20 }}>
          <EvolutionChart history={history} alert={alert} latestScore={latestScore} />
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 16 }}>
          Need at least 2 sessions for a chart.
        </div>
      )}

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {history.map((entry, i) => (
          <SessionRow
            key={`${entry.timestamp}-${i}`}
            entry={entry}
            isLatest={i === 0}
            alert={alert && i === 0}
          />
        ))}
      </div>
    </div>
  );
}

function AuditStrip({ issues, score }: { issues: StructureIssue[]; score: number }) {
  const [open, setOpen] = useState(false);
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warnCount = issues.filter(i => i.severity === 'warning').length;

  const color = score >= 90
    ? 'var(--color-status-ok)'
    : score >= 70
    ? 'var(--color-status-warn)'
    : 'var(--color-status-error)';

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '5px 20px', border: 'none', background: 'transparent',
          cursor: issues.length > 0 ? 'pointer' : 'default', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>
          Structure
        </span>
        <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 700, color, flexShrink: 0 }}>
          {score}
        </span>
        {errorCount > 0 && (
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-status-error)', backgroundColor: 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', flexShrink: 0 }}>
            {errorCount} error{errorCount > 1 ? 's' : ''}
          </span>
        )}
        {warnCount > 0 && (
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-status-warn)', backgroundColor: 'rgba(234,179,8,0.1)', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(234,179,8,0.3)', flexShrink: 0 }}>
            {warnCount} warning{warnCount > 1 ? 's' : ''}
          </span>
        )}
        {issues.length === 0 && (
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-status-ok)' }}>no issues</span>
        )}
        {issues.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--color-text-muted)', flexShrink: 0 }}>
            {open ? '▲' : '▼'}
          </span>
        )}
      </button>

      {open && issues.length > 0 && (
        <div style={{ padding: '0 20px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {issues.map((issue, i) => (
            <div key={i} style={{ padding: '8px 10px', borderRadius: 6, backgroundColor: issue.severity === 'error' ? 'rgba(239,68,68,0.06)' : 'rgba(234,179,8,0.06)', border: `1px solid ${issue.severity === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)'}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{ fontSize: 10, flexShrink: 0, color: issue.severity === 'error' ? 'var(--color-status-error)' : 'var(--color-status-warn)', marginTop: 1 }}>
                  {issue.severity === 'error' ? '✕' : '⚠'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-primary)', lineHeight: 1.4 }}>{issue.issue}</div>
                  {issue.section && (
                    <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: 2 }}>section: {issue.section}</div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.4 }}>→ {issue.suggestion}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function KnowledgeBrowser({ agentId }: Props) {
  const { data: files, isLoading } = useKnowledge(agentId);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [specialView, setSpecialView] = useState<'skill' | 'digest' | 'plugin-skill' | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedPluginSkill, setSelectedPluginSkill] = useState<PluginSkill | null>(null);
  const [pluginSkillsOpen, setPluginSkillsOpen] = useState(true);

  const { data: fileContent } = useKnowledgeFile(agentId, specialView ? null : selectedPath);
  const { data: skill } = useSkill(agentId);
  const { data: digest } = useDigest(agentId);
  const { data: searchResults } = useKnowledgeSearch(agentId, searchQuery);
  const { data: qualityData } = useSkillQuality(agentId);
  const { data: auditData } = useSkillAudit(agentId);
  const { data: pluginSkills } = useSkills(agentId);

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: 13 }}>
      Loading knowledge...
    </div>
  );

  const displayFiles = searchQuery ? searchResults : files;
  const activeContent =
    specialView === 'skill' ? skill?.content
    : specialView === 'digest' ? digest?.content
    : specialView === 'plugin-skill' ? selectedPluginSkill?.content
    : fileContent?.content;

  const currentFile = displayFiles?.find(f => f.path === selectedPath);

  const grouped: Record<string, typeof files> = {};
  for (const f of displayFiles ?? []) {
    const dir = f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : '.';
    if (!grouped[dir]) grouped[dir] = [];
    grouped[dir].push(f);
  }

  const specialBtnStyle = (active: boolean): React.CSSProperties => ({
    width: '100%',
    textAlign: 'left',
    padding: '6px 10px',
    borderRadius: 6,
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    fontWeight: active ? 600 : 400,
    border: active ? '1px solid var(--color-accent-dim)' : '1px solid transparent',
    cursor: 'pointer',
    backgroundColor: active ? 'var(--color-accent-glow)' : 'transparent',
    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
    transition: 'all 120ms',
    letterSpacing: '0.02em',
  });

  // Latest eval results for delta bars
  const latestEval = qualityData?.history[0]?.eval_results ?? [];

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Sidebar */}
      <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-surface-1)' }}>

        {/* Search */}
        <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={{ position: 'relative' }}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              style={{
                width: '100%',
                backgroundColor: 'var(--color-surface-2)',
                border: '1px solid var(--color-border-default)',
                borderRadius: 6,
                padding: '5px 8px 5px 26px',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
            />
          </div>
        </div>

        {/* Pinned: SKILL.md + digest.md */}
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <button style={specialBtnStyle(specialView === 'skill')} onClick={() => { setSpecialView('skill'); setSelectedPath(null); setShowHistory(false); }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>◆ SKILL.md</span>
              {qualityData?.latest_score != null && (
                <span style={{
                  fontSize: 9,
                  padding: '1px 5px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: qualityData.alert
                    ? 'rgba(239,68,68,0.15)'
                    : qualityData.latest_score >= 0.75
                      ? 'rgba(34,197,94,0.15)'
                      : 'rgba(234,179,8,0.15)',
                  color: qualityData.alert
                    ? 'var(--color-status-error)'
                    : qualityData.latest_score >= 0.75
                      ? 'var(--color-status-ok)'
                      : 'var(--color-status-warn)',
                  border: `1px solid ${qualityData.alert ? 'rgba(239,68,68,0.3)' : qualityData.latest_score >= 0.75 ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.3)'}`,
                }}>
                  {qualityData.alert ? '⚠ ' : ''}{qualityData.latest_score.toFixed(2)}
                </span>
              )}
            </span>
          </button>
          <button style={specialBtnStyle(specialView === 'digest')} onClick={() => { setSpecialView('digest'); setSelectedPath(null); setShowHistory(false); }}>
            ◆ digest.md
          </button>
        </div>

        {/* Plugin Skills */}
        {pluginSkills && pluginSkills.length > 0 && (
          <div style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
            <button
              onClick={() => setPluginSkillsOpen(o => !o)}
              style={{
                width: '100%', textAlign: 'left', padding: '6px 10px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', flex: 1 }}>
                Plugin Skills
              </span>
              <span style={{
                fontSize: 9, fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 3,
                backgroundColor: 'rgba(139,92,246,0.1)', color: 'rgba(139,92,246,0.8)',
                border: '1px solid rgba(139,92,246,0.2)',
              }}>
                {pluginSkills.length}
              </span>
              <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>
                {pluginSkillsOpen ? '▲' : '▼'}
              </span>
            </button>
            {pluginSkillsOpen && (
              <div style={{ padding: '2px 10px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {pluginSkills.map(ps => {
                  const isActive = specialView === 'plugin-skill' && selectedPluginSkill?.name === ps.name;
                  const label = ps.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  return (
                    <button
                      key={ps.name}
                      onClick={() => {
                        setSpecialView('plugin-skill');
                        setSelectedPluginSkill(ps);
                        setSelectedPath(null);
                        setShowHistory(false);
                      }}
                      style={{
                        width: '100%', textAlign: 'left', padding: '5px 8px',
                        borderRadius: 5, fontSize: 11, fontFamily: 'var(--font-mono)',
                        border: isActive ? '1px solid var(--color-accent-dim)' : '1px solid transparent',
                        cursor: 'pointer',
                        backgroundColor: isActive ? 'var(--color-accent-glow)' : 'transparent',
                        color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        transition: 'all 120ms',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--color-surface-2)'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        {ps.description && (
                          <span style={{ fontSize: 9, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {ps.description.slice(0, 40)}{ps.description.length > 40 ? '…' : ''}
                          </span>
                        )}
                        {ps.file_pattern && (
                          <span style={{
                            fontSize: 8, fontFamily: 'var(--font-mono)', flexShrink: 0,
                            color: 'rgba(139,92,246,0.7)', backgroundColor: 'rgba(139,92,246,0.08)',
                            padding: '1px 4px', borderRadius: 3, border: '1px solid rgba(139,92,246,0.15)',
                          }}>
                            {ps.file_pattern.length > 14 ? ps.file_pattern.slice(0, 14) + '…' : ps.file_pattern}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* File tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {Object.entries(grouped).map(([dir, dirFiles]) => (
            <div key={dir} style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', marginBottom: 5, padding: '0 4px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                {dir}
                <span style={{ opacity: 0.5 }}>({dirFiles!.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {dirFiles!.map((f) => {
                  const name = f.path.split('/').pop()!;
                  const active = selectedPath === f.path && !specialView;
                  const wc = weightColor(f.effective_weight);
                  return (
                    <button
                      key={f.path}
                      onClick={() => { setSelectedPath(f.path); setSpecialView(null); setShowHistory(false); }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 8px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        border: active ? '1px solid var(--color-border-default)' : '1px solid transparent',
                        cursor: 'pointer',
                        backgroundColor: active ? 'var(--color-surface-3)' : 'transparent',
                        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        transition: 'all 120ms',
                        position: 'relative',
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.backgroundColor = 'var(--color-surface-2)'; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: 11 }}>{name}</span>
                        <span style={{ fontSize: 9, color: wc, fontFamily: 'var(--font-mono)', marginLeft: 6, flexShrink: 0, opacity: 0.9 }}>{f.effective_weight.toFixed(2)}</span>
                      </div>
                      <div style={{ position: 'absolute', bottom: 4, left: 8, right: 8, height: 2, borderRadius: 1, backgroundColor: 'var(--color-surface-3)' }}>
                        <div style={{ height: '100%', borderRadius: 1, width: `${f.effective_weight * 100}%`, backgroundColor: wc, opacity: 0.7, transition: 'width 300ms ease' }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!displayFiles?.length && (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 12, textAlign: 'center', padding: '20px 0', fontFamily: 'var(--font-mono)' }}>
              {searchQuery ? 'no results' : 'no files yet'}
            </div>
          )}
        </div>
      </div>

      {/* Content pane */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--color-surface-0)' }}>

        {/* File metadata header — knowledge files only */}
        {!specialView && currentFile && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, backgroundColor: 'var(--color-surface-1)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>
                {currentFile.path.split('/').pop()}
              </div>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentFile.path}
              </div>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, flexShrink: 0,
              color: weightColor(currentFile.effective_weight),
              backgroundColor: 'var(--color-surface-2)',
              border: `1px solid ${weightColor(currentFile.effective_weight)}40`,
              padding: '3px 10px', borderRadius: 6,
            }}>
              weight {currentFile.effective_weight.toFixed(3)}
            </div>
          </div>
        )}

        {/* Special file header (SKILL.md / digest.md / plugin-skill) */}
        {specialView && (
          <div style={{ borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0, backgroundColor: 'var(--color-surface-1)' }}>
            {/* Title row */}
            <div style={{ padding: '10px 20px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {specialView === 'skill' ? 'SKILL.md'
                    : specialView === 'digest' ? 'digest.md'
                    : selectedPluginSkill?.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? 'Plugin Skill'}
                </div>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: 1 }}>
                  {specialView === 'skill' ? 'Generated skill file for Claude Code injection'
                    : specialView === 'digest' ? 'Latest consolidation digest'
                    : selectedPluginSkill?.description ?? 'Topic-clustered plugin skill'}
                </div>
              </div>
              {specialView === 'plugin-skill' && selectedPluginSkill?.file_pattern && (
                <span style={{
                  fontSize: 9, fontFamily: 'var(--font-mono)', flexShrink: 0,
                  color: 'rgba(139,92,246,0.8)', backgroundColor: 'rgba(139,92,246,0.08)',
                  padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(139,92,246,0.2)',
                }}>
                  {selectedPluginSkill.file_pattern}
                </span>
              )}
            </div>

            {/* Quality strip — SKILL.md only, single compact row */}
            {specialView === 'skill' && qualityData && (
              <div style={{
                padding: '6px 20px 8px',
                borderTop: '1px solid var(--color-border-subtle)',
                display: 'flex', alignItems: 'center', gap: 10,
                backgroundColor: 'var(--color-surface-0)',
              }}>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>
                  Quality
                </span>

                {qualityData.latest_score != null ? (
                  <>
                    <span style={{
                      fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 700,
                      color: scoreColor(qualityData.latest_score, qualityData.alert),
                      flexShrink: 0,
                    }}>
                      {qualityData.latest_score.toFixed(3)}
                    </span>
                    {qualityData.alert && (
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-status-error)', backgroundColor: 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', flexShrink: 0 }}>
                        ⚠ ALERT
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>no data</span>
                )}

                {/* Per-prompt delta bars */}
                {latestEval.length > 0 && (
                  <div style={{ marginLeft: 4 }}>
                    <DeltaBars results={latestEval} />
                  </div>
                )}

                {/* History button — pushed to right */}
                {qualityData.history.length > 0 && !showHistory && (
                  <button
                    onClick={() => setShowHistory(true)}
                    style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', background: 'transparent', border: '1px solid var(--color-border-subtle)', borderRadius: 5, cursor: 'pointer', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                  >
                    <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    History
                  </button>
                )}
              </div>
            )}

            {/* Structure audit strip — SKILL.md only */}
            {specialView === 'skill' && auditData && (
              <div style={{ borderTop: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-surface-0)' }}>
                <AuditStrip issues={auditData.issues} score={auditData.overall_score} />
              </div>
            )}
          </div>
        )}

        {/* Main content: history view OR markdown */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {specialView === 'skill' && showHistory && qualityData ? (
            <HistoryView
              history={qualityData.history}
              alert={qualityData.alert}
              latestScore={qualityData.latest_score ?? 0}
              onBack={() => setShowHistory(false)}
            />
          ) : activeContent ? (
            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-gray-100 prose-p:text-gray-300 prose-strong:text-gray-100 prose-code:text-indigo-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700 prose-table:text-sm prose-th:text-gray-300 prose-td:text-gray-400 prose-a:text-indigo-400 prose-li:text-gray-300 prose-blockquote:border-indigo-500 prose-blockquote:text-gray-400 prose-hr:border-gray-700">
              <Markdown remarkPlugins={[remarkGfm]}>{activeContent}</Markdown>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-border-default)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Select a file to read</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
