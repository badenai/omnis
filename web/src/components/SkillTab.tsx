import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { useSkill, useSkillQuality, useSkillAudit, useSkillDiff, useRollbackSkill } from '../api/knowledge';
import { useTriggerAuditSkill, useActivityStream } from '../api/scheduler';
import type { StructureIssue, QualityHistoryEntry } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function qualityColor(v: number, alert?: boolean): string {
  if (alert) return 'var(--color-status-error)';
  if (v >= 0.75) return 'var(--color-status-ok)';
  if (v >= 0.5) return 'var(--color-status-warn)';
  return 'var(--color-status-error)';
}
function structureColor(v: number): string {
  if (v >= 80) return 'var(--color-status-ok)';
  if (v >= 60) return 'var(--color-status-warn)';
  return 'var(--color-status-error)';
}
function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Score Arc ──────────────────────────────────────────────────────────────
// A 220° arc gauge. Centre at (50,58). Radius 38. Stroke 5.

const ARC_R = 38;
const ARC_CX = 50;
const ARC_CY = 58;
const ARC_SWEEP = 220; // degrees

function arcPath(degrees: number): string {
  const start = -ARC_SWEEP / 2 - 90; // top-left
  const end = start + degrees;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const sx = ARC_CX + ARC_R * Math.cos(toRad(start));
  const sy = ARC_CY + ARC_R * Math.sin(toRad(start));
  const ex = ARC_CX + ARC_R * Math.cos(toRad(end));
  const ey = ARC_CY + ARC_R * Math.sin(toRad(end));
  const large = degrees > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${ARC_R} ${ARC_R} 0 ${large} 1 ${ex} ${ey}`;
}

const TRACK_PATH = arcPath(ARC_SWEEP);

function ScoreArc({ value, color, label, sub }: {
  value: number; // 0–1
  color: string;
  label: string;
  sub?: string;
}) {
  const [displayed, setDisplayed] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const duration = 700;
    const from = 0;
    const to = value;
    startRef.current = null;
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplayed(from + (to - from) * ease);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  const fillDeg = displayed * ARC_SWEEP;
  const fillPath = fillDeg > 2 ? arcPath(fillDeg) : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ position: 'relative', width: 100, height: 72 }}>
        <svg width="100" height="72" style={{ overflow: 'visible' }}>
          {/* Track */}
          <path
            d={TRACK_PATH}
            fill="none"
            stroke="var(--color-surface-3)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          {/* Fill */}
          {fillPath && (
            <path
              d={fillPath}
              fill="none"
              stroke={color}
              strokeWidth="5"
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 4px ${color}66)`,
              }}
            />
          )}
          {/* Tick marks at 0% and 100% ends */}
          <circle cx={ARC_CX + ARC_R * Math.cos((-ARC_SWEEP / 2 - 90) * Math.PI / 180)}
                  cy={ARC_CY + ARC_R * Math.sin((-ARC_SWEEP / 2 - 90) * Math.PI / 180)}
                  r="1.5" fill="var(--color-surface-4)" />
          <circle cx={ARC_CX + ARC_R * Math.cos((ARC_SWEEP / 2 - 90) * Math.PI / 180)}
                  cy={ARC_CY + ARC_R * Math.sin((ARC_SWEEP / 2 - 90) * Math.PI / 180)}
                  r="1.5" fill="var(--color-surface-4)" />
        </svg>
        {/* Centre label */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          paddingTop: 8,
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1,
            color,
            letterSpacing: '-0.02em',
          }}>
            {(displayed * 100).toFixed(0)}
          </span>
        </div>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      {sub && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-disabled)', marginTop: -2 }}>
          {sub}
        </span>
      )}
    </div>
  );
}

// ─── Mini sparkline ──────────────────────────────────────────────────────────

function Sparkline({ history }: { history: QualityHistoryEntry[] }) {
  if (history.length < 2) return null;
  const pts = history.slice().reverse(); // oldest first
  const scores = pts.map(e => e.score);
  const min = Math.max(0, Math.min(...scores) - 0.05);
  const max = Math.min(1, Math.max(...scores) + 0.05);
  const W = 120, H = 28;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * H;
  const d = scores.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
  const latest = scores[scores.length - 1];
  const prev = scores[scores.length - 2];
  const trend = latest > prev + 0.01 ? '↑' : latest < prev - 0.01 ? '↓' : '→';
  const trendColor = latest > prev + 0.01 ? 'var(--color-status-ok)' : latest < prev - 0.01 ? 'var(--color-status-error)' : 'var(--color-text-muted)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width={W} height={H} style={{ overflow: 'visible' }}>
        <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        <circle cx={x(scores.length - 1)} cy={y(latest)} r="2.5" fill="var(--color-accent)" />
      </svg>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: trendColor, fontWeight: 600 }}>{trend}</span>
    </div>
  );
}

// ─── Issues list ─────────────────────────────────────────────────────────────

function IssueRow({ issue }: { issue: StructureIssue }) {
  const [open, setOpen] = useState(false);
  const isError = issue.severity === 'error';
  const accent = isError ? 'var(--color-status-error)' : 'var(--color-status-warn)';

  return (
    <div
      style={{
        borderLeft: `2px solid ${accent}`,
        paddingLeft: 10,
        paddingTop: 6,
        paddingBottom: 6,
        cursor: 'pointer',
        borderRadius: '0 4px 4px 0',
        transition: 'background 120ms',
      }}
      onClick={() => setOpen(o => !o)}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-surface-2)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: accent, flexShrink: 0, fontWeight: 700 }}>
          {isError ? '✕' : '⚠'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4, flex: 1 }}>
          {issue.issue}
        </span>
        <span style={{ fontSize: 9, color: 'var(--color-text-disabled)', flexShrink: 0, marginLeft: 4 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>
      {open && (
        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic', lineHeight: 1.5, paddingRight: 4 }}>
          → {issue.suggestion}
        </div>
      )}
    </div>
  );
}

// ─── Left panel ──────────────────────────────────────────────────────────────

interface LeftPanelProps {
  agentId: string;
  onAudit: () => void;
  isPending: boolean;
  error?: string | null;
  onRollback: () => void;
  isRollbackPending: boolean;
  canRollback: boolean;
  rollbackError?: string | null;
}

function LeftPanel({ agentId, onAudit, isPending, error, onRollback, isRollbackPending, canRollback, rollbackError }: LeftPanelProps) {
  const [confirmRollback, setConfirmRollback] = useState(false);
  const { data: quality } = useSkillQuality(agentId);
  const { data: audit } = useSkillAudit(agentId);

  const latestScore = quality?.latest_score ?? null;
  const alert = quality?.alert ?? false;
  const history = quality?.history ?? [];
  const structureScore = audit?.overall_score ?? null;
  const issues = audit?.issues ?? [];
  const auditTs = audit?.timestamp;

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warnCount = issues.filter(i => i.severity === 'warning').length;

  return (
    <div style={{
      width: 220,
      flexShrink: 0,
      borderRight: '1px solid var(--color-border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--color-surface-1)',
      overflow: 'hidden',
    }}>
      {/* Audit button */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
        <button
          onClick={onAudit}
          disabled={isPending}
          style={{
            width: '100%',
            padding: '8px 0',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            borderRadius: 8,
            border: 'none',
            cursor: isPending ? 'default' : 'pointer',
            backgroundColor: isPending ? 'var(--color-surface-3)' : 'var(--color-accent)',
            color: isPending ? 'var(--color-text-muted)' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'opacity 150ms, background 150ms',
            opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? (
            <>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
                <path d="M6 2a4 4 0 1 0 4 4" />
              </svg>
              Auditing…
            </>
          ) : (
            <>
              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Audit Skill
            </>
          )}
        </button>
        {auditTs && (
          <p style={{ margin: '6px 0 0', fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', textAlign: 'center' }}>
            last run {relativeTime(auditTs)}
          </p>
        )}
        {error && (
          <p style={{ margin: '6px 0 0', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-status-error)', textAlign: 'center', lineHeight: 1.4, wordBreak: 'break-word' }}>
            {error}
          </p>
        )}
      </div>

      {/* Rollback button */}
      <div style={{ padding: '10px 16px 10px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
        {confirmRollback ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-status-warn)', textAlign: 'center', lineHeight: 1.4 }}>
              Revert to previous SKILL.md?
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => { setConfirmRollback(false); onRollback(); }}
                style={{
                  flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600,
                  fontFamily: 'var(--font-sans)', borderRadius: 6, border: 'none',
                  cursor: 'pointer', backgroundColor: 'var(--color-status-error)', color: '#fff',
                }}
              >
                Revert
              </button>
              <button
                onClick={() => setConfirmRollback(false)}
                style={{
                  flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600,
                  fontFamily: 'var(--font-sans)', borderRadius: 6,
                  border: '1px solid var(--color-border-default)', cursor: 'pointer',
                  backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-secondary)',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmRollback(true)}
            disabled={!canRollback || isRollbackPending}
            title={!canRollback ? 'No previous version available' : 'Revert SKILL.md to previous version and analyze the regression'}
            style={{
              width: '100%', padding: '6px 0', fontSize: 11, fontWeight: 600,
              fontFamily: 'var(--font-sans)', borderRadius: 6,
              border: '1px solid var(--color-border-default)',
              cursor: (!canRollback || isRollbackPending) ? 'default' : 'pointer',
              backgroundColor: 'var(--color-surface-2)',
              color: (!canRollback || isRollbackPending) ? 'var(--color-text-disabled)' : 'var(--color-text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              opacity: (!canRollback || isRollbackPending) ? 0.5 : 1,
              transition: 'opacity 150ms',
            }}
          >
            {isRollbackPending ? (
              <>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
                  <path d="M6 2a4 4 0 1 0 4 4" />
                </svg>
                Rolling back…
              </>
            ) : (
              <>
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                  <path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6 6-6" />
                </svg>
                Rollback Skill
              </>
            )}
          </button>
        )}
        {rollbackError && (
          <p style={{ margin: '5px 0 0', fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-status-error)', textAlign: 'center', lineHeight: 1.4, wordBreak: 'break-word' }}>
            {rollbackError}
          </p>
        )}
      </div>

      {/* Gauge section */}
      <div style={{ padding: '16px 12px 12px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: 4 }}>
          {latestScore != null ? (
            <ScoreArc
              value={latestScore}
              color={qualityColor(latestScore, alert)}
              label="Content"
              sub={alert ? '⚠ alert' : undefined}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: 0.4, width: 100 }}>
              <div style={{ width: 72, height: 50, borderRadius: 4, backgroundColor: 'var(--color-surface-3)' }} />
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Content</span>
            </div>
          )}
          {structureScore != null ? (
            <ScoreArc
              value={structureScore / 100}
              color={structureColor(structureScore)}
              label="Structure"
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: 0.4, width: 100 }}>
              <div style={{ width: 72, height: 50, borderRadius: 4, backgroundColor: 'var(--color-surface-3)' }} />
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Structure</span>
            </div>
          )}
        </div>

        {/* Quality trend sparkline */}
        {history.length > 1 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {history.length} sessions
            </span>
            <Sparkline history={history} />
          </div>
        )}
      </div>

      {/* Issues */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        {issues.length === 0 && structureScore == null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, opacity: 0.5 }}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-text-muted)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
              Run audit to check skill quality
            </span>
          </div>
        )}
        {issues.length === 0 && structureScore != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
            <span style={{ fontSize: 11, color: 'var(--color-status-ok)' }}>✓</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>No structural issues</span>
          </div>
        )}
        {issues.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              {errorCount > 0 && (
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-status-error)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', padding: '1px 6px', borderRadius: 4 }}>
                  {errorCount} error{errorCount > 1 ? 's' : ''}
                </span>
              )}
              {warnCount > 0 && (
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-status-warn)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', padding: '1px 6px', borderRadius: 4 }}>
                  {warnCount} warning{warnCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {issues.map((issue, i) => <IssueRow key={i} issue={issue} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  agentId: string;
}

export default function SkillTab({ agentId }: Props) {
  const [view, setView] = useState<'content' | 'diff'>('content');
  const [auditError, setAuditError] = useState<string | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const { data: skillData } = useSkill(agentId);
  const { data: diffData } = useSkillDiff(agentId);
  const triggerAudit = useTriggerAuditSkill(agentId);
  const rollback = useRollbackSkill(agentId);
  const { active } = useActivityStream();
  const qc = useQueryClient();
  const isJobRunning = active.some(j => j.agent_id === agentId && j.task === 'audit-skill');
  const isRollbackRunning = active.some(j => j.agent_id === agentId && j.task === 'rollback');

  // Invalidate audit + skill data when the audit-skill or rollback job for this agent completes
  const prevActiveKeys = useRef<string[]>([]);
  useEffect(() => {
    const currentKeys = active
      .filter(j => j.agent_id === agentId && (j.task === 'audit-skill' || j.task === 'rollback'))
      .map(j => j.key);
    const prev = prevActiveKeys.current;
    const justFinished = prev.filter(k => !currentKeys.includes(k));
    if (justFinished.length > 0) {
      qc.invalidateQueries({ queryKey: ['knowledge', agentId] });
    }
    prevActiveKeys.current = currentKeys;
  }, [active, agentId, qc]);

  const skillContent = skillData?.content ?? '';
  const hasDiff = !!diffData?.old_content;

  function handleAudit() {
    setAuditError(null);
    triggerAudit.mutateAsync().catch((e: unknown) => {
      const raw = e instanceof Error ? e.message : String(e);
      const match = raw.match(/"detail":"([^"]+)"/);
      setAuditError(match ? match[1] : raw);
    });
  }

  function handleRollback() {
    setRollbackError(null);
    rollback.mutateAsync().catch((e: unknown) => {
      const raw = e instanceof Error ? e.message : String(e);
      const match = raw.match(/"detail":"([^"]+)"/);
      setRollbackError(match ? match[1] : raw);
    });
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: gauges + issues */}
      <LeftPanel
        agentId={agentId}
        onAudit={handleAudit}
        isPending={triggerAudit.isPending || isJobRunning}
        error={auditError}
        onRollback={handleRollback}
        isRollbackPending={rollback.isPending || isRollbackRunning}
        canRollback={!!diffData?.old_content}
        rollbackError={rollbackError}
      />

      {/* Right: content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Content toolbar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 20px',
          height: 40,
          flexShrink: 0,
          borderBottom: '1px solid var(--color-border-subtle)',
          backgroundColor: 'var(--color-surface-1)',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600, letterSpacing: '0.04em' }}>
            SKILL.md
          </span>
          <div style={{ flex: 1 }} />
          {/* View toggle */}
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border-default)' }}>
            {(['content', 'diff'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                disabled={v === 'diff' && !hasDiff}
                style={{
                  padding: '3px 10px',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  border: 'none',
                  cursor: v === 'diff' && !hasDiff ? 'default' : 'pointer',
                  backgroundColor: view === v ? 'var(--color-surface-3)' : 'transparent',
                  color: view === v ? 'var(--color-text-primary)' : v === 'diff' && !hasDiff ? 'var(--color-text-disabled)' : 'var(--color-text-muted)',
                  transition: 'background 120ms, color 120ms',
                }}
              >
                {v === 'content' ? 'View' : 'Diff'}
              </button>
            ))}
          </div>
        </div>

        {/* Content body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {view === 'content' ? (
            skillContent ? (
              <div className="prose prose-invert prose-sm max-w-none prose-headings:text-gray-100 prose-p:text-gray-300 prose-strong:text-gray-100 prose-code:text-indigo-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700 prose-table:text-sm prose-th:text-gray-300 prose-td:text-gray-400 prose-a:text-indigo-400 prose-li:text-gray-300 prose-blockquote:border-indigo-500 prose-blockquote:text-gray-400 prose-hr:border-gray-700">
                <Markdown remarkPlugins={[remarkGfm]}>{skillContent}</Markdown>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, opacity: 0.5 }}>
                <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-border-default)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No skill file yet — run consolidation first</span>
              </div>
            )
          ) : (
            diffData?.old_content ? (
              <ReactDiffViewer
                oldValue={diffData.old_content}
                newValue={diffData.new_content}
                splitView={false}
                compareMethod={DiffMethod.WORDS}
                useDarkTheme
                styles={{
                  variables: {
                    dark: {
                      diffViewerBackground: 'var(--color-surface-0)',
                      addedBackground: 'rgba(34,197,94,0.08)',
                      addedGutterBackground: 'rgba(34,197,94,0.12)',
                      removedBackground: 'rgba(239,68,68,0.08)',
                      removedGutterBackground: 'rgba(239,68,68,0.12)',
                      wordAddedBackground: 'rgba(34,197,94,0.25)',
                      wordRemovedBackground: 'rgba(239,68,68,0.25)',
                      gutterBackground: 'var(--color-surface-1)',
                      codeFoldBackground: 'var(--color-surface-2)',
                    },
                  },
                }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No previous version to diff</span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
