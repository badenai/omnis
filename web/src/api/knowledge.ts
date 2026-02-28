import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { KnowledgeFile, KnowledgeFileContent } from '../types';

export function useKnowledge(agentId: string) {
  return useQuery({
    queryKey: ['knowledge', agentId],
    queryFn: () => apiFetch<KnowledgeFile[]>(`/knowledge/${agentId}`),
    enabled: !!agentId,
  });
}

export function useKnowledgeFile(agentId: string, path: string | null) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'file', path],
    queryFn: () => apiFetch<KnowledgeFileContent>(`/knowledge/${agentId}/file?path=${encodeURIComponent(path!)}`),
    enabled: !!agentId && !!path,
  });
}

export function useSkill(agentId: string) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'skill'],
    queryFn: () => apiFetch<{ content: string }>(`/knowledge/${agentId}/skill`),
    enabled: !!agentId,
  });
}

export function useBriefing(agentId: string) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'briefing'],
    queryFn: () => apiFetch<{ content: string }>(`/knowledge/${agentId}/briefing`),
    enabled: !!agentId,
  });
}

export function useMemory(agentId: string) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'memory'],
    queryFn: () => apiFetch<{ content: string }>(`/knowledge/${agentId}/memory`),
    enabled: !!agentId,
  });
}

export function useInbox(agentId: string) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'inbox'],
    queryFn: () => apiFetch<{ items: string[]; count: number }>(`/knowledge/${agentId}/inbox`),
    enabled: !!agentId,
  });
}

export function useKnowledgeSearch(agentId: string, query: string) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'search', query],
    queryFn: () => apiFetch<KnowledgeFileContent[]>(`/knowledge/${agentId}/search?q=${encodeURIComponent(query)}`),
    enabled: !!agentId && query.length > 0,
  });
}
