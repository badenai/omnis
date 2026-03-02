import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useActivityStream } from '../api/scheduler';
import ActivityDrawer from './ActivityDrawer';

function AgentsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function SchedulerIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="14" height="12" rx="2" />
      <path d="M4 6l3 2.5L4 11" />
      <path d="M9 11h3" />
    </svg>
  );
}

function ChevronUpIcon({ flipped }: { flipped?: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round"
      style={{ transform: flipped ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}
    >
      <path d="M2 8l4-4 4 4" />
    </svg>
  );
}

export default function Layout() {
  const { active, history } = useActivityStream();
  const activeCount = active.length;
  const historyCount = history.length;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const prevCountRef = useRef(0);

  // Auto-open drawer when a job starts (only on 0 → 1+ transition)
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = activeCount;
    if (activeCount > 0 && prev === 0) {
      setDrawerOpen(true);
    }
  }, [activeCount]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: 'var(--color-surface-0)',
        color: 'var(--color-text-primary)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Top row: sidebar + main content */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Sidebar */}
        <nav
          style={{
            width: 240,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--color-surface-1)',
            borderRight: '1px solid var(--color-border-subtle)',
          }}
        >
          {/* Logo */}
          <div style={{ padding: '20px', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <defs>
                    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="5%" stopColor="#818cf8" />
                      <stop offset="35%" stopColor="var(--color-accent)" />
                      <stop offset="80%" stopColor="var(--color-accent-dim)" />
                      <stop offset="100%" stopColor="var(--color-surface-4)" />
                    </linearGradient>
                    <filter id="glow" x="-25%" y="-25%" width="150%" height="150%">
                      <feGaussianBlur stdDeviation="1.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>
                  <g filter="url(#glow)">
                    <ellipse cx="12" cy="12" rx="7" ry="9" stroke="url(#ringGrad)" strokeWidth="4.5" />
                  </g>
                </svg>
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1, color: 'var(--color-text-primary)' }}>
                Omnis
              </div>
            </div>
          </div>

          {/* Nav */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '12px', marginTop: 4 }}>
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150 ${isActive ? 'font-medium' : ''}`
              }
              style={({ isActive }) => ({
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                backgroundColor: isActive ? 'var(--color-surface-3)' : 'transparent',
              })}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      style={{
                        position: 'absolute', left: 0, top: 4, bottom: 4,
                        width: 2, borderRadius: 999, backgroundColor: 'var(--color-accent)',
                      }}
                    />
                  )}
                  <AgentsIcon />
                  <span>Agents</span>
                  {activeCount > 0 && (
                    <span style={{ marginLeft: 'auto' }}>
                      <span
                        className="animate-pulse"
                        style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-status-active)' }}
                      />
                    </span>
                  )}
                </>
              )}
            </NavLink>

            <NavLink
              to="/jobs"
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150 ${isActive ? 'font-medium' : ''}`
              }
              style={({ isActive }) => ({
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                backgroundColor: isActive ? 'var(--color-surface-3)' : 'transparent',
              })}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      style={{
                        position: 'absolute', left: 0, top: 4, bottom: 4,
                        width: 2, borderRadius: 999, backgroundColor: 'var(--color-accent)',
                      }}
                    />
                  )}
                  <SchedulerIcon />
                  <span>Scheduler</span>
                </>
              )}
            </NavLink>
          </div>

          <div style={{ flex: 1 }} />

          {/* Training Log toggle button */}
          <button
            onClick={() => setDrawerOpen(v => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '11px 16px',
              width: '100%',
              background: drawerOpen ? 'var(--color-surface-3)' : 'transparent',
              border: 'none',
              borderTop: '1px solid var(--color-border-subtle)',
              cursor: 'pointer',
              color: activeCount > 0 ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
              transition: 'background 150ms, color 150ms',
              textAlign: 'left',
            }}
            onMouseEnter={e => {
              if (!drawerOpen) (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-2)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-primary)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = drawerOpen ? 'var(--color-surface-3)' : 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = activeCount > 0 ? 'var(--color-text-secondary)' : 'var(--color-text-muted)';
            }}
          >
            <span style={{ color: activeCount > 0 ? 'var(--color-accent)' : 'inherit' }}>
              <TerminalIcon />
            </span>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', flex: 1, letterSpacing: '0.02em' }}>
              {activeCount > 0 ? `${activeCount} running` : 'Training Log'}
            </span>
            {activeCount > 0 && (
              <span
                className="animate-pulse"
                style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-status-active)', flexShrink: 0 }}
              />
            )}
            <ChevronUpIcon flipped={drawerOpen} />
          </button>
        </nav>

        {/* Main content */}
        <main
          style={{
            flex: 1,
            overflow: 'auto',
            backgroundColor: 'var(--color-surface-0)',
          }}
        >
          <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', padding: '32px' }}>
            <Outlet />
          </div>
        </main>
      </div>

      {/* Training Log drawer — sits at bottom, pushes content up */}
      <ActivityDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeCount={activeCount}
        historyCount={historyCount}
      />
    </div>
  );
}
