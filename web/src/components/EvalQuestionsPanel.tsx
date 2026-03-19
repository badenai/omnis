import { useState } from 'react';
import { useUpdateConfig } from '../api/agents';
import type { AgentDetail } from '../types';
import Tooltip from './Tooltip';

interface Props {
  agentId: string;
  agent: AgentDetail;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: 'var(--color-surface-2)',
  border: '1px solid var(--color-border-default)',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '13px',
  color: 'var(--color-text-primary)',
  outline: 'none',
  transition: 'border-color 0.15s',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  color: 'var(--color-text-muted)',
  display: 'block',
  marginBottom: '6px',
  fontWeight: 500,
};

export default function EvalQuestionsPanel({ agentId, agent }: Props) {
  const updateConfig = useUpdateConfig(agentId);
  const [prompts, setPrompts] = useState<string[]>(
    agent.skill_eval?.prompts?.length ? agent.skill_eval.prompts : ['']
  );
  const [threshold, setThreshold] = useState(agent.skill_eval?.min_quality_threshold ?? 0.6);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    setMessage('');
    try {
      await updateConfig.mutateAsync({
        skill_eval: {
          prompts: prompts.map(s => s.trim()).filter(Boolean),
          min_quality_threshold: threshold,
          enabled: true,
        },
      });
      setMessage('Saved.');
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <label style={labelStyle}>
          Test Prompts
          <Tooltip text="Each box is one independent test prompt. After consolidation, the agent answers each prompt with and without the skill and grades the difference. Write complete questions — multi-line text is fine and stays as one prompt." />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {prompts.map((prompt, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, flex: 1 }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)',
                  backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-border-default)',
                  borderRight: 'none', borderRadius: '8px 0 0 8px', padding: '8px 8px',
                  lineHeight: '1.5', userSelect: 'none' as const, flexShrink: 0,
                }}>
                  {idx + 1}
                </span>
                <textarea
                  value={prompt}
                  onChange={(e) => {
                    const next = [...prompts];
                    next[idx] = e.target.value;
                    setPrompts(next);
                  }}
                  rows={3}
                  placeholder="Write a complete test question for this skill…"
                  style={{
                    ...inputStyle,
                    fontFamily: 'var(--font-mono)',
                    resize: 'vertical',
                    flex: 1,
                    borderRadius: '0 8px 8px 0',
                    fontSize: 12,
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
                />
              </div>
              {prompts.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPrompts(prompts.filter((_, i) => i !== idx))}
                  style={{
                    padding: '4px 8px', fontSize: 16, lineHeight: 1,
                    border: '1px solid var(--color-border-subtle)', borderRadius: 6,
                    cursor: 'pointer', backgroundColor: 'transparent',
                    color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2,
                  }}
                  title="Remove this prompt"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPrompts([...prompts, ''])}
            style={{
              alignSelf: 'flex-start', padding: '5px 12px', fontSize: 11,
              fontFamily: 'var(--font-mono)', borderRadius: 6,
              border: '1px solid var(--color-border-default)',
              backgroundColor: 'transparent', color: 'var(--color-text-secondary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Add prompt
          </button>
        </div>
      </div>

      <div>
        <label style={labelStyle}>
          Min Quality Threshold: {threshold.toFixed(2)}
          <Tooltip text="Alert when the latest SKILL.md quality score drops below this value, or drops more than 20% relative to the previous run. Range 0.0–1.0." />
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button
          onClick={handleSave}
          disabled={updateConfig.isPending}
          style={{
            padding: '7px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
            border: 'none', cursor: 'pointer', backgroundColor: 'var(--color-accent)',
            color: '#fff', opacity: updateConfig.isPending ? 0.5 : 1,
          }}
        >
          {updateConfig.isPending ? 'Saving...' : 'Save Eval Config'}
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
