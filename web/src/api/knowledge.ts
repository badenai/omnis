import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { KnowledgeFile, KnowledgeFileContent, QualityHistory, SkillAudit } from '../types';

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

export function useDigest(agentId: string) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'digest'],
    queryFn: () => apiFetch<{ content: string }>(`/knowledge/${agentId}/digest`),
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

export function useSessionReport(agentId: string) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'session-report'],
    queryFn: () => apiFetch<{ content: string }>(`/knowledge/${agentId}/session-report`),
    enabled: !!agentId,
    retry: false,
  });
}

export function useSkillDiff(agentId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'skill-diff'],
    queryFn: () => apiFetch<{ old_content: string | null; new_content: string }>(`/knowledge/${agentId}/skill-diff`),
    enabled: !!agentId && (options?.enabled ?? true),
    retry: false,
  });
}

export function useDigestDiff(agentId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'digest-diff'],
    queryFn: () => apiFetch<{ old_content: string | null; new_content: string }>(`/knowledge/${agentId}/digest-diff`),
    enabled: !!agentId && (options?.enabled ?? true),
    retry: false,
  });
}

export function useSkillQuality(agentId: string) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'quality'],
    queryFn: () => apiFetch<QualityHistory>(`/knowledge/${agentId}/quality`),
    enabled: !!agentId,
    retry: false,
  });
}

export function useSkillAudit(agentId: string) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'audit'],
    queryFn: () => apiFetch<SkillAudit>(`/knowledge/${agentId}/audit`),
    enabled: !!agentId,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
