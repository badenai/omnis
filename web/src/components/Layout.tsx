import { NavLink, Outlet } from 'react-router-dom';
import { useActivity } from '../api/scheduler';
import ActivityPanel from './ActivityPanel';

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

export default function Layout() {
  const { data } = useActivity();
  const activeCount = data?.active?.length ?? 0;

  return (
    <div
      className="flex h-screen"
      style={{ backgroundColor: 'var(--color-surface-0)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
    >
      {/* Sidebar */}
      <nav
        className="w-60 shrink-0 flex flex-col"
        style={{ backgroundColor: 'var(--color-surface-1)', borderRight: '1px solid var(--color-border-subtle)' }}
      >
        {/* Logo */}
        <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div className="flex items-center gap-1.5">
            {/* Orbital swirl logo mark */}
            <div
              className="w-10 h-10 flex items-center justify-center shrink-0"
            >
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
            <div className="text-xl font-semibold leading-none" style={{ color: 'var(--color-text-primary)' }}>
              Omnis
            </div>
          </div>
        </div>

        {/* Nav */}
        <div className="flex flex-col gap-0.5 p-3 mt-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150 ${
                isActive ? 'font-medium' : ''
              }`
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
                    className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--color-accent)' }}
                  />
                )}
                <AgentsIcon />
                <span>Agents</span>
                {activeCount > 0 && (
                  <span className="ml-auto flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ backgroundColor: 'var(--color-status-active)' }}
                    />
                  </span>
                )}
              </>
            )}
          </NavLink>

          <NavLink
            to="/jobs"
            className={({ isActive }) =>
              `group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150 ${
                isActive ? 'font-medium' : ''
              }`
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
                    className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--color-accent)' }}
                  />
                )}
                <SchedulerIcon />
                <span>Scheduler</span>
              </>
            )}
          </NavLink>
        </div>

        <div className="flex-1" />

        {/* Activity Panel */}
        <div className="p-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
          <div
            className="rounded-lg p-3"
            style={{ backgroundColor: 'var(--color-surface-2)' }}
          >
            <div
              className="text-[10px] uppercase tracking-[0.1em] font-medium mb-2"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
            >
              Activity
            </div>
            <ActivityPanel />
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main
        className="flex-1 overflow-auto"
        style={{ backgroundColor: 'var(--color-surface-0)' }}
      >
        <div className="w-full max-w-7xl mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
