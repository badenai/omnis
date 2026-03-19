import { useState, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { useUpdateSoul, useIntegrateSoul, useRevertSoul } from '../api/agents';

function parseSuggestions(markdown: string): Array<{ id: string; title: string; content: string }> {
  // Primary: split on ## headings, keep only chunks that start with ##
  const bySections = markdown.split(/^(?=## )/m).filter(s => s.trimStart().startsWith('## '));
  if (bySections.length > 0) return bySections.map((s, i) => ({
    id: String(i),
    content: s.trim(),
    title: s.match(/^## (.+)/m)?.[1]?.trim() ?? `Suggestion ${i + 1}`,
  }));

  // Fallback: bold-numbered items **1. Title** (legacy Gemini format)
  const byBoldNumbers = markdown.split(/^(?=\*\*\d+\.)/m).filter(s => s.trim().match(/^\*\*\d+\./));
  if (byBoldNumbers.length > 0) return byBoldNumbers.map((s, i) => ({
    id: String(i),
    content: s.trim(),
    title: s.match(/^\*\*\d+\.\s+(.+?)\*\*/)?.[1]?.trim() ?? `Suggestion ${i + 1}`,
  }));

  // Fallback: plain numbered items
  const byNumbers = markdown.split(/^(?=\d+\. )/m).filter(s => s.trim().match(/^\d+\./));
  if (byNumbers.length > 0) return byNumbers.map((s, i) => ({
    id: String(i),
    content: s.trim(),
    title: s.match(/^\d+\.\s+\*\*(.+?)\*\*/)?.[1] ?? `Suggestion ${i + 1}`,
  }));

  return [{ id: '0', content: markdown.trim(), title: 'Soul Evolution Suggestions' }];
}

interface SoulEvolutionTabProps {
  agentId: string;
  soul: string;
  hasSoulBackup: boolean;
  suggestionsData: { suggestions: string | null } | undefined;
  refetchSuggestions: () => void;
  isFetchingSuggestions: boolean;
}

export default function SoulEvolutionTab({ agentId, soul, hasSoulBackup, suggestionsData, refetchSuggestions, isFetchingSuggestions }: SoulEvolutionTabProps) {
  const updateSoul = useUpdateSoul(agentId);
  const integrateSoul = useIntegrateSoul(agentId);
  const revertSoul = useRevertSoul(agentId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [integrationMsg, setIntegrationMsg] = useState('');
  const [previewSoul, setPreviewSoul] = useState<string | null>(null);
  const [incorporated, setIncorporated] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`omnis_incorporated_${agentId}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const suggestions = useMemo(
    () => (suggestionsData?.suggestions ? parseSuggestions(suggestionsData.suggestions) : []),
    [suggestionsData],
  );

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });

  const handleIntegrate = async () => {
    const selectedTexts = suggestions.filter(s => selected.has(s.id)).map(s => s.content);
    setIntegrationMsg('');
    try {
      const result = await integrateSoul.mutateAsync({ soul, suggestions: selectedTexts });
      setPreviewSoul(result.integrated_soul);
    } catch (e) {
      setIntegrationMsg('Error: ' + (e as Error).message);
    }
  };

  const handleApply = async () => {
    if (!previewSoul) return;
    try {
      await updateSoul.mutateAsync(previewSoul);
      const next = new Set(incorporated);
      suggestions.filter(s => selected.has(s.id)).forEach(s => next.add(s.title));
      setIncorporated(next);
      localStorage.setItem(`omnis_incorporated_${agentId}`, JSON.stringify([...next]));
      setPreviewSoul(null);
      setSelected(new Set());
      setIntegrationMsg('Soul updated. Revert available if needed.');
    } catch (e) {
      setIntegrationMsg('Error: ' + (e as Error).message);
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {previewSoul ? (
          /* Preview mode header */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)', flex: 1 }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-status-warning, #f59e0b)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Preview — review before applying
            </div>
            <button
              onClick={handleApply}
              disabled={updateSoul.isPending}
              style={{ padding: '5px 12px', fontSize: 11, borderRadius: 6, border: 'none', backgroundColor: 'var(--color-accent)', color: '#fff', cursor: updateSoul.isPending ? 'default' : 'pointer', opacity: updateSoul.isPending ? 0.7 : 1, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)' }}
            >
              {updateSoul.isPending && (
                <div style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
              )}
              ✓ Apply Soul
            </button>
            <button
              onClick={() => setPreviewSoul(null)}
              style={{ padding: '5px 12px', fontSize: 11, borderRadius: 6, border: '1px solid var(--color-border-default)', backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
            >
              ✗ Cancel
            </button>
          </>
        ) : (
          /* Normal mode header */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)', flex: 1 }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-accent)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Soul Evolution Suggestions
            </div>
            {/* Integrate button — appears inline in header when items selected */}
            {selected.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {selected.size} selected
                </span>
                {integrationMsg && (
                  <span style={{ fontSize: 11, color: integrationMsg.startsWith('Error') ? 'var(--color-status-error)' : 'var(--color-status-success)' }}>
                    {integrationMsg}
                  </span>
                )}
                <button
                  onClick={handleIntegrate}
                  disabled={integrateSoul.isPending}
                  style={{ padding: '5px 12px', fontSize: 11, borderRadius: 6, border: 'none', backgroundColor: 'var(--color-accent)', color: '#fff', cursor: integrateSoul.isPending ? 'default' : 'pointer', opacity: integrateSoul.isPending ? 0.7 : 1, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)' }}
                >
                  {integrateSoul.isPending && (
                    <div style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
                  )}
                  Integrate into Soul
                </button>
              </div>
            )}
            {hasSoulBackup && (
              <button
                onClick={() => revertSoul.mutateAsync()}
                disabled={revertSoul.isPending}
                style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--color-border-default)', backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-muted)', cursor: revertSoul.isPending ? 'default' : 'pointer', opacity: revertSoul.isPending ? 0.6 : 1, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {revertSoul.isPending && (
                  <div style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid var(--color-accent-dim)', borderTopColor: 'var(--color-accent)', animation: 'spin 0.8s linear infinite' }} />
                )}
                Revert
              </button>
            )}
            <button
              onClick={() => refetchSuggestions()}
              disabled={isFetchingSuggestions}
              style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--color-border-default)', backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', cursor: isFetchingSuggestions ? 'default' : 'pointer', opacity: isFetchingSuggestions ? 0.6 : 1, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              {isFetchingSuggestions && (
                <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid var(--color-accent-dim)', borderTopColor: 'var(--color-accent)', animation: 'spin 0.8s linear infinite' }} />
              )}
              {isFetchingSuggestions ? 'Loading...' : 'Refresh'}
            </button>
          </>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {previewSoul ? (
          /* Preview mode: diff view */
          <ReactDiffViewer
            oldValue={soul}
            newValue={previewSoul}
            splitView={false}
            compareMethod={DiffMethod.WORDS}
            useDarkTheme
            styles={{
              variables: {
                dark: {
                  diffViewerBackground: 'var(--color-surface-1)',
                  addedBackground: 'rgba(34,197,94,0.12)',
                  addedColor: '#86efac',
                  removedBackground: 'rgba(239,68,68,0.12)',
                  removedColor: '#fca5a5',
                  wordAddedBackground: 'rgba(34,197,94,0.3)',
                  wordRemovedBackground: 'rgba(239,68,68,0.3)',
                  codeFoldBackground: 'var(--color-surface-2)',
                  codeFoldGutterBackground: 'var(--color-surface-2)',
                },
              },
              contentText: { fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '1.6' },
              gutter: { minWidth: 36 },
            }}
          />
        ) : suggestions.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '24px 0' }}>
            {isFetchingSuggestions ? 'Generating suggestions...' : 'No suggestions yet. Run a consolidation to generate them.'}
          </div>
        ) : (
          suggestions.map(s => {
            const isSelected = selected.has(s.id);
            const isIncorporated = incorporated.has(s.title);
            return (
              <div
                key={s.id}
                onClick={() => toggleSelect(s.id)}
                style={{
                  border: `1px solid ${isSelected ? 'var(--color-accent)' : isIncorporated ? 'rgba(16,185,129,0.25)' : 'var(--color-border-subtle)'}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--color-accent-glow)' : isIncorporated ? 'rgba(16,185,129,0.05)' : 'var(--color-surface-1)',
                  transition: 'border-color 150ms, background-color 150ms',
                  display: 'flex',
                  gap: 12,
                  opacity: isIncorporated && !isSelected ? 0.65 : 1,
                }}
              >
                <div style={{ flexShrink: 0, marginTop: 2 }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 4,
                    border: `1.5px solid ${isSelected ? 'var(--color-accent)' : isIncorporated ? 'rgba(16,185,129,0.5)' : 'var(--color-border-default)'}`,
                    backgroundColor: isSelected ? 'var(--color-accent)' : isIncorporated ? 'rgba(16,185,129,0.2)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 150ms',
                  }}>
                    {isSelected ? (
                      <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isIncorporated ? (
                      <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="rgba(16,185,129,0.9)" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : null}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isIncorporated && (
                    <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(16,185,129,0.8)', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', padding: '1px 6px', borderRadius: 99 }}>
                        ✓ incorporated
                      </span>
                    </div>
                  )}
                  <div className="prose prose-invert prose-sm max-w-none prose-p:text-gray-400 prose-strong:text-gray-200 prose-headings:text-gray-200 prose-li:text-gray-400 prose-a:text-indigo-400 [&_li::marker]:content-none">
                    <Markdown remarkPlugins={[remarkGfm]}>{s.content}</Markdown>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
