import { useState } from 'react';
import { useUpdateSoul } from '../api/agents';
import SoulAssistantPanel from './SoulAssistantPanel';

interface Props {
  agentId: string;
  initialSoul: string;
}

export default function SoulEditor({ agentId, initialSoul }: Props) {
  const [soul, setSoul] = useState(initialSoul);
  const updateSoul = useUpdateSoul(agentId);
  const [message, setMessage] = useState('');
  const [showAssistant, setShowAssistant] = useState(false);

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
    <div style={{ display: 'flex', gap: 12 }}>
      {/* Left: textarea + save row */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <textarea
          value={soul}
          onChange={(e) => setSoul(e.target.value)}
          placeholder="Write SOUL.md content here..."
          style={{
            width: '100%',
            height: showAssistant ? '100%' : '40vh',
            minHeight: 200,
            flex: showAssistant ? 1 : undefined,
            backgroundColor: 'var(--color-surface-2)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-primary)',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleSave}
            disabled={updateSoul.isPending}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: 'var(--color-accent)', color: '#fff', opacity: updateSoul.isPending ? 0.5 : 1, transition: 'background 150ms' }}
            onMouseEnter={(e) => { if (!updateSoul.isPending) e.currentTarget.style.backgroundColor = 'var(--color-accent-dim)'; }}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent)')}
          >
            {updateSoul.isPending ? 'Saving...' : 'Save Soul'}
          </button>
          <button
            onClick={() => setShowAssistant(s => !s)}
            style={{
              padding: '7px 16px',
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              border: '1px solid var(--color-border-default)',
              cursor: 'pointer',
              backgroundColor: showAssistant ? 'var(--color-accent-glow)' : 'transparent',
              color: showAssistant ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              borderColor: showAssistant ? 'var(--color-accent-dim)' : 'var(--color-border-default)',
              transition: 'all 150ms',
            }}
          >
            ✦ AI Assist
          </button>
          {message && (
            <span style={{ fontSize: 13, color: message.startsWith('Error') ? 'var(--color-status-error)' : 'var(--color-status-ok)' }}>
              {message}
            </span>
          )}
        </div>
      </div>

      {/* Right: assistant panel */}
      {showAssistant && (
        <div style={{
          flex: 1,
          minHeight: 400,
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 8,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <SoulAssistantPanel
            currentSoul={soul}
            onApply={(s) => setSoul(s)}
            agentId={agentId}
          />
        </div>
      )}
    </div>
  );
}
