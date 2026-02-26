import { useState } from 'react';
import { useUpdateSoul } from '../api/agents';

interface Props {
  agentId: string;
  initialSoul: string;
}

export default function SoulEditor({ agentId, initialSoul }: Props) {
  const [soul, setSoul] = useState(initialSoul);
  const updateSoul = useUpdateSoul(agentId);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    setMessage('');
    try {
      await updateSoul.mutateAsync(soul);
      setMessage('Soul saved.');
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={soul}
        onChange={(e) => setSoul(e.target.value)}
        className="w-full h-[60vh] bg-gray-900 border border-gray-700 rounded px-4 py-3 text-sm font-mono focus:outline-none focus:border-indigo-500 resize-none"
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
  );
}
