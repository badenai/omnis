import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { JobInfo } from '../types';

export interface JobActivity {
  key: string;
  agent_id: string;
  task: string;
  step: string;
  started_at: string;
  finished_at: string | null;
  state: 'running' | 'completed' | 'failed';
  error: string | null;
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

export function useTriggerCollection(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) =>
      apiFetch(`/scheduler/trigger/${agentId}/collect/${encodeURIComponent(handle)}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export function useTriggerConsolidation(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/scheduler/trigger/${agentId}/consolidate`, { method: 'POST' }),
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

export function useTriggerResearch(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/scheduler/trigger/${agentId}/research`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export function useDiscoveredSources(agentId: string) {
  return useQuery({
    queryKey: ['discovered-sources', agentId],
    queryFn: () => apiFetch<{ content: string }>(`/agents/${agentId}/discovered-sources`),
    refetchInterval: false,
  });
}
