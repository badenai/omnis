import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { JobInfo } from '../types';

export function useJobs() {
  return useQuery({
    queryKey: ['jobs'],
    queryFn: () => apiFetch<JobInfo[]>('/scheduler/jobs'),
    refetchInterval: 30000,
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
