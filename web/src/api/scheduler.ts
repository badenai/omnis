import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { JobInfo, LogEntry } from '../types';

export interface JobActivity {
  key: string;
  agent_id: string;
  task: string;
  step: string;
  started_at: string;
  finished_at: string | null;
  state: 'running' | 'completed' | 'failed';
  error: string | null;
  logs: LogEntry[];
}

export function useJobs() {
  return useQuery({
    queryKey: ['jobs'],
    queryFn: () => apiFetch<JobInfo[]>('/scheduler/jobs'),
    refetchInterval: 30000,
  });
}

export function useActivity() {
  return useQuery({
    queryKey: ['activity'],
    queryFn: () => apiFetch<{ active: JobActivity[]; history: JobActivity[] }>('/scheduler/activity'),
    refetchInterval: 3000,
  });
}

export function useActivityStream() {
  const [data, setData] = useState<{ active: JobActivity[]; history: JobActivity[] }>({
    active: [],
    history: [],
  });

  useEffect(() => {
    const es = new EventSource('/api/scheduler/activity/stream');
    es.onmessage = (e) => {
      try {
        setData(JSON.parse(e.data));
      } catch {
        // ignore malformed frames
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  return data;
}

export function useTriggerRun(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/scheduler/trigger/${agentId}/run`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export function useTriggerCollection(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) =>
      apiFetch(`/scheduler/trigger/${agentId}/collect/${encodeURIComponent(handle)}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export function useTriggerReevaluation(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/scheduler/trigger/${agentId}/reevaluate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export function useTriggerFactCheck(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) =>
      apiFetch(`/scheduler/trigger/${agentId}/fact-check/${encodeURIComponent(sourceId)}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export function useResetSourceStatus(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) =>
      apiFetch(`/agents/${agentId}/sources/${encodeURIComponent(sourceId)}/reset-status`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents', agentId] }),
  });
}

export function useSoulSuggestions(agentId: string) {
  return useQuery({
    queryKey: ['soul-suggestions', agentId],
    queryFn: () => apiFetch<{ suggestions: string | null }>(`/agents/${agentId}/soul-suggestions`),
    refetchInterval: false,
  });
}

export function useDiscoveredSources(agentId: string) {
  return useQuery({
    queryKey: ['discovered-sources', agentId],
    queryFn: () => apiFetch<{ content: string }>(`/agents/${agentId}/discovered-sources`),
    refetchInterval: false,
  });
}
