import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateAgent, useUpdateConfig } from '../api/agents';
import type { AgentDetail, ChannelSource } from '../types';
import ChannelList from './ChannelList';
import CronInput from './CronInput';

interface Props {
  agent?: AgentDetail;
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
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-text-muted)',
  display: 'block',
  marginBottom: '6px',
  fontWeight: 500,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function StyledInput(props: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  const { mono, ...rest } = props;
  return (
    <input
      {...rest}
      style={{ ...inputStyle, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)' }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; props.onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; props.onBlur?.(e); }}
    />
  );
}

function StyledSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{ ...inputStyle, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; props.onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; props.onBlur?.(e); }}
    />
  );
}

function StyledTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{ ...inputStyle, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; props.onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; props.onBlur?.(e); }}
    />
  );
}

export default function AgentForm({ agent }: Props) {
  const isEdit = !!agent;
  const navigate = useNavigate();
  const createAgent = useCreateAgent();
  const updateConfig = useUpdateConfig(agent?.agent_id ?? '');

  const [agentId, setAgentId] = useState(agent?.agent_id ?? '');
  const [model, setModel] = useState(agent?.model ?? 'gemini');
  const [analysisMode, setAnalysisMode] = useState(agent?.analysis_mode ?? 'transcript_only');
  const [collectionModel, setCollectionModel] = useState(agent?.collection_model ?? 'gemini-3-flash-preview');
  const [consolidationModel, setConsolidationModel] = useState(agent?.consolidation_model ?? 'gemini-3.1-pro-preview');
  const [channels, setChannels] = useState<ChannelSource[]>(
    agent?.sources.youtube_channels ?? []
  );
  const [consolidationSchedule, setConsolidationSchedule] = useState(
    agent?.consolidation_schedule ?? '0 3 * * 0'
  );
  const [halfLife, setHalfLife] = useState(agent?.decay.half_life_days ?? 365);
  const [researchSchedule, setResearchSchedule] = useState(agent?.research?.schedule ?? '0 10 * * *');
  const [soul, setSoul] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const research = {
        schedule: researchSchedule,
        enabled: agent?.research?.enabled ?? false
      };
      if (isEdit) {
        await updateConfig.mutateAsync({
          model,
          analysis_mode: analysisMode,
          sources: { youtube_channels: channels },
          consolidation_schedule: consolidationSchedule,
          decay: { half_life_days: halfLife },
          collection_model: collectionModel,
          consolidation_model: consolidationModel,
          research,
        });
        setMessage('Config saved.');
      } else {
        await createAgent.mutateAsync({
          agent_id: agentId,
          model,
          analysis_mode: analysisMode,
          sources: { youtube_channels: channels },
          consolidation_schedule: consolidationSchedule,
          decay: { half_life_days: halfLife },
          collection_model: collectionModel,
          consolidation_model: consolidationModel,
          soul,
          research,
        });
        navigate(`/agents/${agentId}`);
      }
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      {!isEdit && (
        <Field label="Agent ID">
          <StyledInput
            type="text"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            required
            pattern="[a-z0-9\-]+"
            placeholder="my-agent-name"
            mono
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Model">
          <StyledSelect value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="gemini">gemini</option>
            <option value="openai">openai</option>
            <option value="claude">claude</option>
          </StyledSelect>
        </Field>
        <Field label="Analysis Mode">
          <StyledSelect value={analysisMode} onChange={(e) => setAnalysisMode(e.target.value)}>
            <option value="transcript_only">transcript_only</option>
            <option value="full_video">full_video</option>
          </StyledSelect>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Collection Model">
          <StyledInput
            type="text"
            value={collectionModel}
            onChange={(e) => setCollectionModel(e.target.value)}
            mono
          />
        </Field>
        <Field label="Consolidation Model">
          <StyledInput
            type="text"
            value={consolidationModel}
            onChange={(e) => setConsolidationModel(e.target.value)}
            mono
          />
        </Field>
      </div>

      <Field label="YouTube Channels">
        <ChannelList channels={channels} onChange={setChannels} />
      </Field>

      <Field label="Consolidation Schedule">
        <CronInput value={consolidationSchedule} onChange={setConsolidationSchedule} />
      </Field>

      <Field label={`Decay Half-Life: ${halfLife} days`}>
        <input
          type="range"
          min={30}
          max={3650}
          value={halfLife}
          onChange={(e) => setHalfLife(Number(e.target.value))}
          className="w-full"
        />
      </Field>

      <Field label="Research Schedule">
        <CronInput value={researchSchedule} onChange={setResearchSchedule} />
      </Field>

      {!isEdit && (
        <Field label="Soul (SOUL.md)">
          <StyledTextarea
            value={soul}
            onChange={(e) => setSoul(e.target.value)}
            rows={8}
            placeholder="Agent personality and instructions..."
          />
        </Field>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent-dim)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent)')}
        >
          {saving ? 'Saving...' : isEdit ? 'Save Config' : 'Create Agent'}
        </button>
        {message && (
          <span
            className="text-sm"
            style={{ color: message.startsWith('Error') ? 'var(--color-status-error)' : 'var(--color-status-ok)' }}
          >
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
