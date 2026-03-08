import { useState } from 'react';
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


export default function Layout() {
  const { active, history } = useActivityStream();
  const activeCount = active.length;
  const historyCount = history.length;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prevActiveCount, setPrevActiveCount] = useState(activeCount);

  // Auto-open drawer on 0 → 1+ transition (derived state update during render)
  if (prevActiveCount !== activeCount) {
    setPrevActiveCount(activeCount);
    if (prevActiveCount === 0 && activeCount > 0 && !drawerOpen) {
      setDrawerOpen(true);
    }
  }

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
            width: 56,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--color-surface-1)',
            borderRight: '1px solid var(--color-border-subtle)',
          }}
        >
          {/* Logo */}
          <div style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'center' }}>
            <div>
              <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                    <clipPath id="eyeClip">
                      <ellipse cx="12" cy="12" rx="6.5" ry="8.5" />
                    </clipPath>
                  </defs>
                  
                  <g filter="url(#glow)" className={activeCount === 0 ? "animate-logo-breathe" : ""} style={{ transformOrigin: '12px 12px' }}>
                    <ellipse cx="12" cy="12" rx="7" ry="9" stroke="url(#ringGrad)" strokeWidth="4.5" />
                  </g>

                  {/* Eye content rendered only when active jobs are present */}
                  {activeCount > 0 && (
                    <g clipPath="url(#eyeClip)">
                      <g className="animate-eye-blink" style={{ transformOrigin: '12px 12px' }}>
                        <g 
                          className="animate-eye-look" 
                          style={{ filter: 'drop-shadow(0 0 2px rgba(129, 140, 248, 0.8))' }}
                        >
                          {/* Iris layer */}
                          <circle cx="12" cy="12" r="4" fill="url(#ringGrad)" opacity="0.4" />
                          <circle cx="12" cy="12" r="3" fill="#818cf8" />
                          {/* Pupil layer */}
                          <circle cx="12" cy="12" r="1.5" fill="#ffffff" />
                        </g>
                      </g>
                    </g>
                  )}
                </svg>
              </div>
            </div>
          </div>

          {/* Nav */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 6px', marginTop: 4 }}>
            <NavLink
              to="/"
              end
              title="Agents"
              className={() => `group relative flex items-center justify-center py-2.5 rounded-md transition-colors duration-150`}
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
                        position: 'absolute', left: 0, top: '20%', bottom: '20%',
                        width: 2, borderRadius: 999, backgroundColor: 'var(--color-accent)',
                      }}
                    />
                  )}
                  <AgentsIcon />
                  {activeCount > 0 && (
                    <span style={{ position: 'absolute', top: 5, right: 6 }}>
                      <span
                        className="animate-pulse"
                        style={{ display: 'block', width: 5, height: 5, borderRadius: '50%', backgroundColor: 'var(--color-status-active)' }}
                      />
                    </span>
                  )}
                </>
              )}
            </NavLink>

            <NavLink
              to="/jobs"
              title="Scheduler"
              className={() => `group relative flex items-center justify-center py-2.5 rounded-md transition-colors duration-150`}
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
                        position: 'absolute', left: 0, top: '20%', bottom: '20%',
                        width: 2, borderRadius: 999, backgroundColor: 'var(--color-accent)',
                      }}
                    />
                  )}
                  <SchedulerIcon />
                </>
              )}
            </NavLink>
          </div>

          <div style={{ flex: 1 }} />

          {/* Training Log toggle button */}
          <button
            onClick={() => setDrawerOpen(v => !v)}
            title={activeCount > 0 ? `${activeCount} running` : 'Training Log'}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '14px 0',
              width: '100%',
              background: drawerOpen ? 'var(--color-surface-3)' : 'transparent',
              border: 'none',
              borderTop: '1px solid var(--color-border-subtle)',
              cursor: 'pointer',
              color: activeCount > 0 ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
              transition: 'background 150ms, color 150ms',
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
            {activeCount > 0 && (
              <span
                className="animate-pulse"
                style={{ position: 'absolute', top: 8, right: 8, width: 5, height: 5, borderRadius: '50%', backgroundColor: 'var(--color-status-active)' }}
              />
            )}
          </button>
        </nav>

        {/* Main content */}
        <main
          style={{
            flex: 1,
            overflow: 'hidden',
            backgroundColor: 'var(--color-surface-0)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Outlet />
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
