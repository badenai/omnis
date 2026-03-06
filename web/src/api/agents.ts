import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { AgentSummary, AgentDetail, AgentConfigCreate, AgentConfigUpdate } from '../types';

export function useIntegrateSoul(id: string) {
  return useMutation({
    mutationFn: ({ soul, suggestions }: { soul: string; suggestions: string[] }) =>
      apiFetch<{ integrated_soul: string }>(`/agents/${id}/soul/integrate`, {
        method: 'POST',
        body: JSON.stringify({ soul, suggestions }),
      }),
  });
}

export function useRevertSoul(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<AgentDetail>(`/agents/${id}/soul/revert`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents', id] }),
  });
}

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => apiFetch<AgentSummary[]>('/agents'),
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ['agents', id],
    queryFn: () => apiFetch<AgentDetail>(`/agents/${id}`),
    enabled: !!id,
    refetchInterval: 5000,
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AgentConfigCreate) =>
      apiFetch<AgentDetail>('/agents', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useUpdateConfig(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AgentConfigUpdate) =>
      apiFetch<AgentDetail>(`/agents/${id}/config`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['agents', id] });
    },
  });
}

export function useUpdateSoul(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (soul: string) =>
      apiFetch<AgentDetail>(`/agents/${id}/soul`, { method: 'PUT', body: JSON.stringify({ soul }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents', id] });
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/agents/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useIngestUrl(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, title }: { url: string; title?: string }) =>
      apiFetch(`/agents/${agentId}/ingest/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export function useIngestFile(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, title }: { file: File; title?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (title) form.append('title', title);
      return fetch(`/api/agents/${agentId}/ingest/file`, { method: 'POST', body: form }).then(
        async (res) => {
          if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
          return res.json();
        }
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export function useChannelPreview(agentId: string) {
  return useMutation({
    mutationFn: (url: string) =>
      apiFetch<{ count: number; videos: { id: string; title: string; description: string }[] }>(
        `/agents/${agentId}/ingest/channel/preview`,
        { method: 'POST', body: JSON.stringify({ url }) }
      ),
  });
}

export function useChannelExecute(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, limit }: { url: string; limit: number | null }) =>
      apiFetch(`/agents/${agentId}/ingest/channel/execute`, {
        method: 'POST',
        body: JSON.stringify({ url, limit }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}
