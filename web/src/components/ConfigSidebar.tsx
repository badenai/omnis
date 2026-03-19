import { useState } from 'react';
import { useUpdateConfig } from '../api/agents';
import type { AgentDetail } from '../types';
import { cronToTime, timeToCron } from '../utils/cron';

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
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  color: 'var(--color-text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
};

const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--color-text-muted)',
  fontWeight: 700,
  marginBottom: 12,
};

const fieldLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-text-muted)',
  display: 'block',
  marginBottom: 4,
  fontWeight: 500,
};

export default function ConfigSidebar({ agentId, agent }: Props) {
  const updateConfig = useUpdateConfig(agentId);
  const [model, setModel] = useState(agent.model);
  const [analysisMode, setAnalysisMode] = useState(agent.analysis_mode);
  const [collectionModel, setCollectionModel] = useState(agent.collection_model);
  const [consolidationModel, setConsolidationModel] = useState(agent.consolidation_model);
  const [runTime, setRunTime] = useState(cronToTime(agent.consolidation_schedule));
  const [halfLife, setHalfLife] = useState(agent.decay.half_life_days);
  const [selfImproving, setSelfImproving] = useState(agent.self_improving);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    setMessage('');
    try {
      await updateConfig.mutateAsync({
        model,
        analysis_mode: analysisMode,
        collection_model: collectionModel,
        consolidation_model: consolidationModel,
        consolidation_schedule: timeToCron(runTime),
        decay: { half_life_days: halfLife },
        self_improving: selfImproving,
      });
      setMessage('Saved.');
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    }
  };

  return (
    <aside style={{
      width: 360,
      flexShrink: 0,
      borderLeft: '1px solid var(--color-border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      backgroundColor: 'var(--color-surface-1)',
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        padding: '12px 20px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(18,18,22,0.96)',
        backdropFilter: 'blur(8px)',
      }}>
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Configuration</span>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Pipeline section */}
        <div>
          <div style={sectionLabel}>Pipeline</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={fieldLabel}>Model</label>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
                >
                  <option value="gemini">gemini</option>
                  <option value="openai">openai</option>
                  <option value="claude">claude</option>
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Analysis</label>
                <select
                  value={analysisMode}
                  onChange={e => setAnalysisMode(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
                >
                  <option value="transcript_only">transcript_only</option>
                  <option value="full_video">full_video</option>
                </select>
              </div>
            </div>

            <div>
              <label style={fieldLabel}>Collection Model</label>
              <input
                type="text"
                value={collectionModel}
                onChange={e => setCollectionModel(e.target.value)}
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
              />
            </div>

            <div>
              <label style={fieldLabel}>Consolidation Model</label>
              <input
                type="text"
                value={consolidationModel}
                onChange={e => setConsolidationModel(e.target.value)}
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'end' }}>
              <div>
                <label style={fieldLabel}>Daily Run (UTC)</label>
                <input
                  type="time"
                  value={runTime}
                  onChange={e => setRunTime(e.target.value)}
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
                />
              </div>
              <div>
                <label style={fieldLabel}>Self-Improving</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 0' }}>
                  <input
                    type="checkbox"
                    checked={selfImproving}
                    onChange={e => setSelfImproving(e.target.checked)}
                  />
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {selfImproving ? 'on' : 'off'}
                  </span>
                </label>
              </div>
            </div>

          </div>
        </div>

        {/* Knowledge Decay section */}
        <div>
          <div style={sectionLabel}>Knowledge Decay</div>
          <div>
            <label style={fieldLabel}>Half-Life: {halfLife} days</label>
            <input
              type="range"
              min={30}
              max={3650}
              value={halfLife}
              onChange={e => setHalfLife(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>30d — fast</span>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>3650d — permanent</span>
            </div>
          </div>
        </div>

      </div>

      {/* Footer: save button */}
      <div style={{ flexShrink: 0, padding: '12px 20px', borderTop: '1px solid var(--color-border-subtle)' }}>
        {message && (
          <div style={{
            fontSize: 11, fontFamily: 'var(--font-mono)', marginBottom: 8,
            color: message.startsWith('Error') ? 'var(--color-status-error)' : 'var(--color-status-ok)',
          }}>
            {message}
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={updateConfig.isPending}
          style={{
            width: '100%', padding: '8px 16px', fontSize: 12, fontWeight: 600,
            borderRadius: 8, border: 'none', cursor: 'pointer',
            backgroundColor: 'var(--color-accent)', color: '#fff',
            opacity: updateConfig.isPending ? 0.5 : 1,
          }}
        >
          {updateConfig.isPending ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </aside>
  );
}
