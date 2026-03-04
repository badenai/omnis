import { useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useKnowledge, useKnowledgeFile, useSkill, useDigest, useKnowledgeSearch } from '../api/knowledge';

interface Props {
  agentId: string;
}

const weightColor = (w: number) => {
  if (w >= 0.65) return 'var(--color-accent)';
  if (w >= 0.35) return 'var(--color-status-warn)';
  return 'var(--color-text-muted)';
};

export default function KnowledgeBrowser({ agentId }: Props) {
  const { data: files, isLoading } = useKnowledge(agentId);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [specialView, setSpecialView] = useState<'skill' | 'digest' | null>(null);

  const { data: fileContent } = useKnowledgeFile(agentId, specialView ? null : selectedPath);
  const { data: skill } = useSkill(agentId);
  const { data: digest } = useDigest(agentId);
  const { data: searchResults } = useKnowledgeSearch(agentId, searchQuery);

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: 13 }}>
      Loading knowledge...
    </div>
  );

  const displayFiles = searchQuery ? searchResults : files;
  const activeContent =
    specialView === 'skill' ? skill?.content
    : specialView === 'digest' ? digest?.content
    : fileContent?.content;

  const currentFile = displayFiles?.find(f => f.path === selectedPath);

  const grouped: Record<string, typeof files> = {};
  for (const f of displayFiles ?? []) {
    const dir = f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : '.';
    if (!grouped[dir]) grouped[dir] = [];
    grouped[dir].push(f);
  }

  const specialBtnStyle = (active: boolean): React.CSSProperties => ({
    width: '100%',
    textAlign: 'left',
    padding: '6px 10px',
    borderRadius: 6,
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    fontWeight: active ? 600 : 400,
    border: active ? '1px solid var(--color-accent-dim)' : '1px solid transparent',
    cursor: 'pointer',
    backgroundColor: active ? 'var(--color-accent-glow)' : 'transparent',
    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
    transition: 'all 120ms',
    letterSpacing: '0.02em',
  });

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Sidebar */}
      <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-surface-1)' }}>

        {/* Search */}
        <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={{ position: 'relative' }}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              style={{
                width: '100%',
                backgroundColor: 'var(--color-surface-2)',
                border: '1px solid var(--color-border-default)',
                borderRadius: 6,
                padding: '5px 8px 5px 26px',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
            />
          </div>
        </div>

        {/* Pinned: SKILL.md + digest.md */}
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <button style={specialBtnStyle(specialView === 'skill')} onClick={() => { setSpecialView('skill'); setSelectedPath(null); }}>
            ◆ SKILL.md
          </button>
          <button style={specialBtnStyle(specialView === 'digest')} onClick={() => { setSpecialView('digest'); setSelectedPath(null); }}>
            ◆ digest.md
          </button>
        </div>

        {/* File tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {Object.entries(grouped).map(([dir, dirFiles]) => (
            <div key={dir} style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', marginBottom: 5, padding: '0 4px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                {dir}
                <span style={{ opacity: 0.5 }}>({dirFiles!.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {dirFiles!.map((f) => {
                  const name = f.path.split('/').pop()!;
                  const active = selectedPath === f.path && !specialView;
                  const wc = weightColor(f.effective_weight);
                  return (
                    <button
                      key={f.path}
                      onClick={() => { setSelectedPath(f.path); setSpecialView(null); }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 8px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        border: active ? '1px solid var(--color-border-default)' : '1px solid transparent',
                        cursor: 'pointer',
                        backgroundColor: active ? 'var(--color-surface-3)' : 'transparent',
                        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        transition: 'all 120ms',
                        position: 'relative',
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.backgroundColor = 'var(--color-surface-2)'; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      {/* File name + weight number */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: 11 }}>{name}</span>
                        <span style={{ fontSize: 9, color: wc, fontFamily: 'var(--font-mono)', marginLeft: 6, flexShrink: 0, opacity: 0.9 }}>{f.effective_weight.toFixed(2)}</span>
                      </div>
                      {/* Weight bar */}
                      <div style={{ position: 'absolute', bottom: 4, left: 8, right: 8, height: 2, borderRadius: 1, backgroundColor: 'var(--color-surface-3)' }}>
                        <div style={{ height: '100%', borderRadius: 1, width: `${f.effective_weight * 100}%`, backgroundColor: wc, opacity: 0.7, transition: 'width 300ms ease' }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!displayFiles?.length && (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 12, textAlign: 'center', padding: '20px 0', fontFamily: 'var(--font-mono)' }}>
              {searchQuery ? 'no results' : 'no files yet'}
            </div>
          )}
        </div>
      </div>

      {/* Content pane */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--color-surface-0)' }}>

        {/* File metadata header — shown for knowledge files only */}
        {!specialView && currentFile && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, backgroundColor: 'var(--color-surface-1)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>
                {currentFile.path.split('/').pop()}
              </div>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentFile.path}
              </div>
            </div>
            {/* Weight badge */}
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, flexShrink: 0,
              color: weightColor(currentFile.effective_weight),
              backgroundColor: 'var(--color-surface-2)',
              border: `1px solid ${weightColor(currentFile.effective_weight)}40`,
              padding: '3px 10px', borderRadius: 6,
            }}>
              weight {currentFile.effective_weight.toFixed(3)}
            </div>
          </div>
        )}

        {/* Special file header */}
        {specialView && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0, backgroundColor: 'var(--color-surface-1)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
              {specialView === 'skill' ? 'SKILL.md' : 'digest.md'}
            </div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: 2 }}>
              {specialView === 'skill' ? 'Generated skill file for Claude Code injection' : 'Latest consolidation digest'}
            </div>
          </div>
        )}

        {/* Markdown content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {activeContent ? (
            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-gray-100 prose-p:text-gray-300 prose-strong:text-gray-100 prose-code:text-indigo-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700 prose-table:text-sm prose-th:text-gray-300 prose-td:text-gray-400 prose-a:text-indigo-400 prose-li:text-gray-300 prose-blockquote:border-indigo-500 prose-blockquote:text-gray-400 prose-hr:border-gray-700">
              <Markdown remarkPlugins={[remarkGfm]}>{activeContent}</Markdown>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-border-default)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Select a file to read</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
