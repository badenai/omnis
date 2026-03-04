import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { useSessionReport, useSkillDiff, useDigestDiff } from '../api/knowledge';

interface Props {
  agentId: string;
}

type Tab = 'report' | 'skill' | 'digest';

const TABS: { id: Tab; label: string }[] = [
  { id: 'report', label: 'Session Report' },
  { id: 'skill', label: 'SKILL Diff' },
  { id: 'digest', label: 'Digest Diff' },
];

const diffStyles = {
  variables: {
    dark: {
      diffViewerBackground: 'var(--color-surface-2)',
      addedBackground: 'rgba(34,197,94,0.12)',
      addedColor: '#86efac',
      removedBackground: 'rgba(239,68,68,0.12)',
      removedColor: '#fca5a5',
      wordAddedBackground: 'rgba(34,197,94,0.25)',
      wordRemovedBackground: 'rgba(239,68,68,0.25)',
      addedGutterBackground: 'rgba(34,197,94,0.08)',
      removedGutterBackground: 'rgba(239,68,68,0.08)',
      gutterBackground: 'var(--color-surface-1)',
      gutterBackgroundDark: 'var(--color-surface-2)',
      highlightBackground: 'rgba(99,102,241,0.1)',
      highlightGutterBackground: 'rgba(99,102,241,0.1)',
      codeFoldBackground: 'var(--color-surface-3)',
      emptyLineBackground: 'var(--color-surface-2)',
      gutterColor: 'var(--color-text-muted)',
      addedGutterColor: '#86efac',
      removedGutterColor: '#fca5a5',
      codeFoldContentColor: 'var(--color-text-secondary)',
      diffViewerTitleBackground: 'var(--color-surface-1)',
      diffViewerTitleColor: 'var(--color-text-primary)',
      diffViewerTitleBorderColor: 'var(--color-border-subtle)',
    },
  },
};

function DiffPane({
  data,
  isLoading,
  isError,
  fileName,
}: {
  data: { old_content: string | null; new_content: string } | undefined;
  isLoading: boolean;
  isError: boolean;
  fileName: string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 360, color: 'var(--color-text-muted)' }}>
        <span className="text-sm">Loading...</span>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 360, color: 'var(--color-status-error)' }}>
        <span className="text-sm">Failed to load diff.</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 360, color: 'var(--color-text-muted)' }}>
        <span className="text-sm">No data yet. Run a consolidation to see results here.</span>
      </div>
    );
  }
  return (
    <div className="overflow-auto" style={{ minHeight: 360 }}>
      {data.old_content === null && (
        <div
          className="px-4 py-2 text-xs mb-2 rounded-lg"
          style={{
            color: 'var(--color-status-warn)',
            backgroundColor: 'rgba(234,179,8,0.08)',
            border: '1px solid rgba(234,179,8,0.2)',
          }}
        >
          First run — no previous version to compare.
        </div>
      )}
      <ReactDiffViewer
        oldValue={data.old_content ?? ''}
        newValue={data.new_content}
        splitView={true}
        useDarkTheme={true}
        compareMethod={DiffMethod.WORDS}
        styles={diffStyles}
        leftTitle={data.old_content !== null ? `${fileName}.previous` : '(none)'}
        rightTitle={fileName}
        hideLineNumbers={false}
      />
    </div>
  );
}

export default function SessionPanel({ agentId }: Props) {
  const [tab, setTab] = useState<Tab>('report');

  const { data: reportData, isLoading: reportLoading, isError: reportError } = useSessionReport(agentId);
  const { data: skillDiff, isLoading: skillLoading, isError: skillError } = useSkillDiff(agentId, { enabled: tab === 'skill' });
  const { data: digestDiff, isLoading: digestLoading, isError: digestError } = useDigestDiff(agentId, { enabled: tab === 'digest' });

  return (
    <div className="flex flex-col">
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Session panel"
        className="flex items-center gap-1 p-1 rounded-lg mb-3 shrink-0 self-start"
        style={{ backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-border-default)' }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`session-tabpanel-${t.id}`}
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150"
            style={{
              backgroundColor: tab === t.id ? 'var(--color-accent)' : 'transparent',
              color: tab === t.id ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        id={`session-tabpanel-${tab}`}
        role="tabpanel"
        className="border rounded-lg overflow-hidden"
        style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-surface-2)', minHeight: 360 }}
      >
        {tab === 'report' && (
          reportLoading ? (
            <div className="flex items-center justify-center" style={{ minHeight: 360, color: 'var(--color-text-muted)' }}>
              <span className="text-sm">Loading...</span>
            </div>
          ) : reportError ? (
            <div className="flex items-center justify-center" style={{ minHeight: 360, color: 'var(--color-status-error)' }}>
              <span className="text-sm">Failed to load session report.</span>
            </div>
          ) : reportData ? (
            <div style={{ margin: 16, backgroundColor: 'var(--color-surface-1)', borderRadius: 10, padding: '20px 24px' }}>
              <div className="prose prose-invert prose-sm max-w-none prose-headings:text-gray-100 prose-p:text-gray-300 prose-strong:text-gray-100 prose-code:text-indigo-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700 prose-table:text-sm prose-th:text-gray-300 prose-td:text-gray-400 prose-a:text-indigo-400 prose-li:text-gray-300 prose-blockquote:border-indigo-500 prose-blockquote:text-gray-400 prose-hr:border-gray-700">
                <Markdown remarkPlugins={[remarkGfm]}>{reportData.content}</Markdown>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center" style={{ minHeight: 360, color: 'var(--color-text-muted)' }}>
              <span className="text-sm">No session yet. Run a consolidation to see results here.</span>
            </div>
          )
        )}

        {tab === 'skill' && (
          <DiffPane data={skillDiff} isLoading={skillLoading} isError={skillError} fileName="SKILL.md" />
        )}

        {tab === 'digest' && (
          <DiffPane data={digestDiff} isLoading={digestLoading} isError={digestError} fileName="digest.md" />
        )}
      </div>
    </div>
  );
}
