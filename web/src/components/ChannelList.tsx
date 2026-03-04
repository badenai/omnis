import type { ChannelSource } from '../types';

interface Props {
  channels: ChannelSource[];
  onChange: (channels: ChannelSource[]) => void;
  onSync?: (handle: string) => void;
}

export default function ChannelList({ channels, onChange, onSync }: Props) {
  const add = () => onChange([...channels, { handle: '' }]);
  const update = (i: number, value: string) => { const next = [...channels]; next[i] = { handle: value }; onChange(next); };
  const remove = (i: number) => onChange(channels.filter((_, idx) => idx !== i));

  const inputStyle: React.CSSProperties = {
    flex: 1,
    backgroundColor: 'var(--color-surface-2)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-primary)',
    outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {channels.map((ch, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {onSync && (
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-status-ok)', flexShrink: 0 }} />
          )}
          <input
            type="text"
            value={ch.handle}
            onChange={(e) => update(i, e.target.value)}
            placeholder="@ChannelHandle"
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
          />
          {onSync && ch.handle && (
            <button
              type="button"
              onClick={() => onSync(ch.handle)}
              style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)', borderRadius: 6, border: '1px solid var(--color-border-default)', backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', cursor: 'pointer', flexShrink: 0 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            >
              SYNC
            </button>
          )}
          <button
            type="button"
            onClick={() => remove(i)}
            style={{ padding: '5px 8px', fontSize: 12, borderRadius: 6, border: 'none', backgroundColor: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', flexShrink: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-status-error)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        style={{ alignSelf: 'flex-start', padding: '5px 10px', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 6, border: '1px solid var(--color-border-subtle)', backgroundColor: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
      >
        + Add Channel
      </button>
    </div>
  );
}
