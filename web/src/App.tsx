import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import AgentList from './components/AgentList';
import AgentDetail from './components/AgentDetail';
import CreateAgent from './components/CreateAgent';
import JobList from './components/JobList';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<AgentList />} />
          <Route path="/agents/new" element={<CreateAgent />} />
          <Route path="/agents/:id" element={<AgentDetail />} />
          <Route path="/jobs" element={<JobList />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
