import { NavLink, Outlet } from 'react-router-dom';
import ActivityPanel from './ActivityPanel';

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 font-sans">
      <nav className="w-64 shrink-0 bg-gray-900/40 border-r border-white/5 flex flex-col backdrop-blur-xl transition-all duration-300">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse border-2 border-indigo-200"></div>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Omnis</h1>
              <p className="text-[10px] font-medium uppercase tracking-widest text-indigo-400 mt-0.5">Knowledge Agent</p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col gap-2 p-4">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isActive ? 'bg-indigo-500/10 text-indigo-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] ring-1 ring-white/5' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`
            }
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            Agents
          </NavLink>
          <NavLink
            to="/jobs"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isActive ? 'bg-indigo-500/10 text-indigo-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] ring-1 ring-white/5' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`
            }
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Scheduler
          </NavLink>
        </div>
        
        <div className="flex-1" />
        
        <div className="p-4">
          <div className="bg-gray-950/50 rounded-2xl p-4 ring-1 ring-white/5 backdrop-blur-md">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Activity</h3>
            <ActivityPanel />
          </div>
        </div>
      </nav>
      
      <main className="flex-1 overflow-auto relative bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAzNHYtbGgtMmwzLTN2LTJoLTh2NGwzIDN2M2gtMy41bC0yLTVoLTlsLTIgNWgtMy41djNoM3Y4aC0zLjV2M2g5YTEgMSAwIDAwMS0xbDIuNS0zLjUgNS0zLjVaIiBzdHJva2U9IiNmZmYiIHN0cm9rZS1vcGFjaXR5PSIuMDIiLz48L2c+PC9zdmc+')] bg-repeat">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-gray-950/50 to-purple-500/5 pointer-events-none" />
        <div className="relative z-10 w-full max-w-7xl mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
