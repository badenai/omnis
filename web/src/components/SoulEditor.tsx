import { useState } from 'react';
import { useUpdateSoul } from '../api/agents';
import { useSoulSuggestions } from '../api/scheduler';

interface Props {
  agentId: string;
  initialSoul: string;
}

export default function SoulEditor({ agentId, initialSoul }: Props) {
  const [soul, setSoul] = useState(initialSoul);
  const updateSoul = useUpdateSoul(agentId);
  const [message, setMessage] = useState('');
  const { data: suggestionsData, refetch: refetchSuggestions, isFetching } = useSoulSuggestions(agentId);

  const handleSave = async () => {
    setMessage('');
    try {
      await updateSoul.mutateAsync(soul);
      setMessage('Soul saved.');
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    }
  };

  const monoLabel: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--color-text-muted)',
    marginBottom: '6px',
    fontWeight: 500,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <textarea
          value={soul}
          onChange={(e) => setSoul(e.target.value)}
          className="w-full h-[45vh] bg-gray-900 border border-gray-700 rounded px-4 py-3 text-sm font-mono focus:outline-none focus:border-indigo-500 resize-none"
          placeholder="Write SOUL.md content here..."
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={updateSoul.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
          >
            {updateSoul.isPending ? 'Saving...' : 'Save Soul'}
          </button>
          {message && (
            <span className={`text-sm ${message.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {message}
            </span>
          )}
        </div>
      </div>

      <div
        className="rounded-lg p-4"
        style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div style={monoLabel}>AI Suggestions</div>
          <button
            onClick={() => refetchSuggestions()}
            disabled={isFetching}
            className="px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-default)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
          >
            {isFetching ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        {suggestionsData?.suggestions ? (
          <pre
            className="text-xs whitespace-pre-wrap leading-relaxed"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', maxHeight: '240px', overflowY: 'auto' }}
          >
            {suggestionsData.suggestions}
          </pre>
        ) : (
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {isFetching ? 'Fetching suggestions...' : 'No suggestions yet. Run a consolidation to generate them.'}
          </div>
        )}
      </div>
    </div>
  );
}
