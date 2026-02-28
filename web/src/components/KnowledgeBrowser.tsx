import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useKnowledge, useKnowledgeFile, useSkill, useMemory, useKnowledgeSearch } from '../api/knowledge';

interface Props {
  agentId: string;
}

export default function KnowledgeBrowser({ agentId }: Props) {
  const { data: files, isLoading } = useKnowledge(agentId);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [specialView, setSpecialView] = useState<'skill' | 'memory' | null>(null);

  const { data: fileContent } = useKnowledgeFile(agentId, specialView ? null : selectedPath);
  const { data: skill } = useSkill(agentId);
  const { data: memory } = useMemory(agentId);
  const { data: searchResults } = useKnowledgeSearch(agentId, searchQuery);

  if (isLoading) return <div className="text-gray-400">Loading knowledge...</div>;

  const displayFiles = searchQuery ? searchResults : files;
  const activeContent =
    specialView === 'skill'
      ? skill?.content
      : specialView === 'memory'
      ? memory?.content
      : fileContent?.content;

  // Group files by directory
  const grouped: Record<string, typeof files> = {};
  for (const f of displayFiles ?? []) {
    const dir = f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : '.';
    if (!grouped[dir]) grouped[dir] = [];
    grouped[dir].push(f);
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-220px)]">
      {/* Sidebar */}
      <div className="w-64 shrink-0 flex flex-col border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-2 border-b border-gray-800">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search knowledge..."
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Special files */}
        <div className="p-2 border-b border-gray-800 space-y-1">
          <button
            onClick={() => { setSpecialView('skill'); setSelectedPath(null); }}
            className={`w-full text-left px-2 py-1.5 rounded text-xs font-medium ${
              specialView === 'skill' ? 'bg-indigo-600/20 text-indigo-300' : 'text-gray-400 hover:bg-gray-800'
            }`}
          >
            SKILL.md
          </button>
          <button
            onClick={() => { setSpecialView('memory'); setSelectedPath(null); }}
            className={`w-full text-left px-2 py-1.5 rounded text-xs font-medium ${
              specialView === 'memory' ? 'bg-indigo-600/20 text-indigo-300' : 'text-gray-400 hover:bg-gray-800'
            }`}
          >
            memory.md
          </button>
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-auto p-2 space-y-3">
          {Object.entries(grouped).map(([dir, dirFiles]) => (
            <div key={dir}>
              <div className="text-xs text-gray-500 font-medium mb-1 px-1">{dir}/</div>
              <div className="space-y-0.5">
                {dirFiles!.map((f) => {
                  const name = f.path.split('/').pop()!;
                  return (
                    <button
                      key={f.path}
                      onClick={() => { setSelectedPath(f.path); setSpecialView(null); }}
                      className={`w-full text-left px-2 py-1 rounded text-xs flex justify-between ${
                        selectedPath === f.path && !specialView
                          ? 'bg-indigo-600/20 text-indigo-300'
                          : 'text-gray-400 hover:bg-gray-800'
                      }`}
                    >
                      <span className="truncate">{name}</span>
                      <span className="text-gray-600 ml-1">{f.effective_weight.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!displayFiles?.length && (
            <div className="text-gray-500 text-xs text-center py-4">
              {searchQuery ? 'No results' : 'No knowledge files'}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 border border-gray-800 rounded-lg overflow-auto">
        {activeContent ? (
          <div className="p-4 prose prose-invert prose-sm max-w-none prose-headings:text-gray-100 prose-p:text-gray-300 prose-strong:text-gray-100 prose-code:text-indigo-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700 prose-table:text-sm prose-th:text-gray-300 prose-td:text-gray-400 prose-a:text-indigo-400 prose-li:text-gray-300 prose-blockquote:border-indigo-500 prose-blockquote:text-gray-400 prose-hr:border-gray-700">
            <Markdown remarkPlugins={[remarkGfm]}>{activeContent}</Markdown>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Select a file to view its content
          </div>
        )}
      </div>
    </div>
  );
}
