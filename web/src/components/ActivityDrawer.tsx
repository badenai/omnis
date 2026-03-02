import { useEffect } from 'react';
import ActivityPanel from './ActivityPanel';

function TerminalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="14" height="12" rx="2" />
      <path d="M4 6l3 2.5L4 11" />
      <path d="M9 11h3" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 4l4 4 4-4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 1l10 10M11 1L1 11" />
    </svg>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  activeCount: number;
  historyCount: number;
}

export default function ActivityDrawer({ open, onClose, activeCount, historyCount }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const hasContent = activeCount > 0 || historyCount > 0;

  return (
    <div
      style={{
        height: open ? 400 : 0,
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'height 240ms cubic-bezier(0.4, 0, 0.2, 1)',
        borderTop: open ? '1px solid var(--color-border-default)' : 'none',
        backgroundColor: 'var(--color-surface-1)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 20px',
          height: 38,
          flexShrink: 0,
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span style={{ color: activeCount > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
            <TerminalIcon />
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
              userSelect: 'none',
            }}
          >
            Training Log
          </span>
          {activeCount > 0 && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '1px 7px',
                borderRadius: 10,
                backgroundColor: 'rgba(59,130,246,0.12)',
                border: '1px solid rgba(59,130,246,0.2)',
              }}
            >
              <span
                className="animate-pulse"
                style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: 'var(--color-status-active)', flexShrink: 0 }}
              />
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-status-active)', lineHeight: 1 }}>
                {activeCount} running
              </span>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Keyboard hint */}
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-disabled)',
              marginRight: 8,
              userSelect: 'none',
            }}
          >
            esc
          </span>
          <button
            onClick={onClose}
            title="Close"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: 4,
              border: 'none', background: 'transparent',
              color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0,
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-surface-4)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-primary)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-muted)';
            }}
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px' }}>
        {!hasContent ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 8,
              color: 'var(--color-text-muted)',
            }}
          >
            <span style={{ opacity: 0.4 }}><TerminalIcon /></span>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>No training activity</span>
          </div>
        ) : (
          <ActivityPanel />
        )}
      </div>
    </div>
  );
}
