import { useState } from 'react';
import { useUpdateSoul } from '../api/agents';

interface Props {
  agentId: string;
  soul: string;
  onSoulChange: (s: string) => void;
}

export default function SoulEditor({ agentId, soul, onSoulChange }: Props) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <textarea
        value={soul}
        onChange={(e) => { onSoulChange(e.target.value); if (message) setMessage(''); }}
        placeholder="Write SOUL.md content here..."
        style={{
          flex: 1,
          width: '100%',
          backgroundColor: 'var(--color-surface-2)',
          border: '1px solid var(--color-border-default)',
          borderRadius: 8,
          padding: '12px 14px',
          fontSize: 13,
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-primary)',
          outline: 'none',
          resize: 'none',
          boxSizing: 'border-box',
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button
          onClick={handleSave}
          disabled={updateSoul.isPending}
          style={{
            padding: '7px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
            border: 'none', cursor: 'pointer', backgroundColor: 'var(--color-accent)',
            color: '#fff', opacity: updateSoul.isPending ? 0.5 : 1,
          }}
        >
          {updateSoul.isPending ? 'Saving...' : 'Save Soul'}
        </button>
        {message && (
          <span style={{ fontSize: 13, color: message.startsWith('Error') ? 'var(--color-status-error)' : 'var(--color-status-ok)' }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
