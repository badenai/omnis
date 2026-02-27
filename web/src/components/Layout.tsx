import { NavLink, Outlet } from 'react-router-dom';
import ActivityPanel from './ActivityPanel';

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <nav className="w-56 shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold tracking-tight text-indigo-400">cloracle</h1>
          <p className="text-xs text-gray-500 mt-0.5">knowledge agent dashboard</p>
        </div>
        <div className="flex flex-col gap-1 p-3">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-3 py-2 rounded text-sm ${isActive ? 'bg-indigo-600/20 text-indigo-300' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`
            }
          >
            Agents
          </NavLink>
          <NavLink
            to="/jobs"
            className={({ isActive }) =>
              `px-3 py-2 rounded text-sm ${isActive ? 'bg-indigo-600/20 text-indigo-300' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`
            }
          >
            Scheduler
          </NavLink>
        </div>
        <div className="flex-1" />
        <ActivityPanel />
      </nav>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
