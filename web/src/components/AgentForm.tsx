import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateAgent, useUpdateConfig } from '../api/agents';
import type { AgentDetail } from '../types';
import Tooltip from './Tooltip';
import SoulAssistantPanel from './SoulAssistantPanel';

function cronToTime(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 2) return '03:00';
  const min = parts[0].padStart(2, '0');
  const hr = parts[1].padStart(2, '0');
  return `${hr}:${min}`;
}

function timeToCron(time: string): string {
  const [hr, min] = time.split(':');
  return `${parseInt(min, 10)} ${parseInt(hr, 10)} * * *`;
}

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


function Field({ label, tooltip, children }: { label: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
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
  const [runTime, setRunTime] = useState(
    cronToTime(agent?.consolidation_schedule ?? '0 3 * * *')
  );
  const [halfLife, setHalfLife] = useState(agent?.decay.half_life_days ?? 365);
  const [selfImproving, setSelfImproving] = useState(agent?.self_improving ?? true);
  const [skillEvalPrompts, setSkillEvalPrompts] = useState<string[]>(
    agent?.skill_eval?.prompts?.length ? agent.skill_eval.prompts : ['']
  );
  const [skillEvalThreshold, setSkillEvalThreshold] = useState(
    agent?.skill_eval?.min_quality_threshold ?? 0.6
  );
  const [soul, setSoul] = useState('');
  const [showSoulAssistant, setShowSoulAssistant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const skillEval = {
        prompts: skillEvalPrompts.map(s => s.trim()).filter(Boolean),
        min_quality_threshold: skillEvalThreshold,
        enabled: true,
      };
      if (isEdit) {
        await updateConfig.mutateAsync({
          model,
          analysis_mode: analysisMode,
          consolidation_schedule: timeToCron(runTime),
          decay: { half_life_days: halfLife },
          collection_model: collectionModel,
          consolidation_model: consolidationModel,
          self_improving: selfImproving,
          skill_eval: skillEval,
        });
        setMessage('Config saved.');
      } else {
        await createAgent.mutateAsync({
          agent_id: agentId,
          model,
          analysis_mode: analysisMode,
          sources: [],
          consolidation_schedule: timeToCron(runTime),
          decay: { half_life_days: halfLife },
          collection_model: collectionModel,
          consolidation_model: consolidationModel,
          soul,
          self_improving: selfImproving,
          skill_eval: skillEval,
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
        <Field label="Agent ID" tooltip="Unique identifier for this agent. Lowercase letters, numbers, and dashes only. Used as the directory name on disk.">
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
        <Field label="Model" tooltip="AI provider used to analyze content. Only Gemini is fully supported right now.">
          <StyledSelect value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="gemini">gemini</option>
            <option value="openai">openai</option>
            <option value="claude">claude</option>
          </StyledSelect>
        </Field>
        <Field label="Analysis Mode" tooltip="transcript_only: downloads text captions and sends them to the model — fast and cheap. full_video: sends the YouTube URL directly to Gemini for native video understanding — better for visual content like charts or demos, but slower and more expensive.">
          <StyledSelect value={analysisMode} onChange={(e) => setAnalysisMode(e.target.value)}>
            <option value="transcript_only">transcript_only</option>
            <option value="full_video">full_video</option>
          </StyledSelect>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Collection Model" tooltip="Model used to analyze each video or article. Called once per piece of content, so use a fast and cheap model (e.g. gemini-2.0-flash).">
          <StyledInput
            type="text"
            value={collectionModel}
            onChange={(e) => setCollectionModel(e.target.value)}
            mono
          />
        </Field>
        <Field label="Consolidation Model" tooltip="Model used to organize knowledge, write the digest, and generate the skill file. Called only a few times per run, so use a smarter model for better quality output (e.g. gemini-2.5-pro).">
          <StyledInput
            type="text"
            value={consolidationModel}
            onChange={(e) => setConsolidationModel(e.target.value)}
            mono
          />
        </Field>
      </div>

      <Field label="Daily Run Time" tooltip="Time of day (UTC) when the agent runs its full pipeline: collect new videos from all channels → consolidate into knowledge → self-improving research (if enabled).">
        <StyledInput
          type="time"
          value={runTime}
          onChange={(e) => setRunTime(e.target.value)}
          mono
        />
      </Field>

      <Field label={`Decay Half-Life: ${halfLife} days`} tooltip="How long before a knowledge file loses half its importance. Short (30–90 days) for fast-moving topics like news. Long (365+ days) for timeless knowledge like techniques or theory. Set to 9999 for permanent.">
        <input
          type="range"
          min={30}
          max={3650}
          value={halfLife}
          onChange={(e) => setHalfLife(Number(e.target.value))}
          className="w-full"
        />
      </Field>

      <Field label="Self-Improving" tooltip="After the daily collection, the agent runs a web research session to find new sources and insights beyond its configured channels. Any discovered YouTube channels are automatically added to future runs.">
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={selfImproving}
            onChange={(e) => setSelfImproving(e.target.checked)}
          />
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Run self-improving session after daily collection
          </span>
        </label>
      </Field>

      <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: 12 }}>
          Skill Quality Evaluation
        </div>
        <div className="space-y-4">
          <div>
            <label style={labelStyle}>
              Test Prompts
              <Tooltip text="Each box is one independent test prompt. After consolidation, the agent answers each prompt with and without the skill and grades the difference. Write complete questions — multi-line text in a box is fine and stays as one prompt." />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {skillEvalPrompts.map((prompt, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, flex: 1 }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)',
                      backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-border-default)',
                      borderRight: 'none', borderRadius: '8px 0 0 8px', padding: '8px 8px',
                      lineHeight: '1.5', userSelect: 'none', flexShrink: 0, marginTop: 0,
                    }}>
                      {idx + 1}
                    </span>
                    <textarea
                      value={prompt}
                      onChange={(e) => {
                        const next = [...skillEvalPrompts];
                        next[idx] = e.target.value;
                        setSkillEvalPrompts(next);
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
                  {skillEvalPrompts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSkillEvalPrompts(skillEvalPrompts.filter((_, i) => i !== idx))}
                      style={{
                        padding: '4px 8px', fontSize: 16, lineHeight: 1, border: '1px solid var(--color-border-subtle)',
                        borderRadius: 6, cursor: 'pointer', backgroundColor: 'transparent',
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
                onClick={() => setSkillEvalPrompts([...skillEvalPrompts, ''])}
                style={{
                  alignSelf: 'flex-start', padding: '5px 12px', fontSize: 11,
                  fontFamily: 'var(--font-mono)', borderRadius: 6,
                  border: '1px solid var(--color-border-default)',
                  backgroundColor: 'transparent', color: 'var(--color-text-secondary)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                Add prompt
              </button>
            </div>
          </div>
          <Field label={`Min Quality Threshold: ${skillEvalThreshold.toFixed(2)}`} tooltip="Alert when the latest SKILL.md quality score drops below this value, or drops more than 20% relative to the previous run. Range 0.0–1.0.">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={skillEvalThreshold}
              onChange={(e) => setSkillEvalThreshold(Number(e.target.value))}
              className="w-full"
            />
          </Field>
        </div>
      </div>

      {!isEdit && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={labelStyle}>
              Soul (SOUL.md)
              <Tooltip text="The agent's personality and mission. Tells the AI what to pay attention to and what to ignore. This is the most important setting — it directly controls what gets collected and learned." />
            </label>
            <button
              type="button"
              onClick={() => setShowSoulAssistant(s => !s)}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 8,
                border: '1px solid var(--color-border-default)',
                cursor: 'pointer',
                backgroundColor: showSoulAssistant ? 'var(--color-accent-glow)' : 'transparent',
                color: showSoulAssistant ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                borderColor: showSoulAssistant ? 'var(--color-accent-dim)' : 'var(--color-border-default)',
                transition: 'all 150ms',
              }}
            >
              ✦ AI Assist
            </button>
          </div>
          <StyledTextarea
            value={soul}
            onChange={(e) => setSoul(e.target.value)}
            rows={8}
            placeholder="Agent personality and instructions..."
          />
          {showSoulAssistant && (
            <div style={{
              marginTop: 10,
              maxHeight: 500,
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 8,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <SoulAssistantPanel
                currentSoul={soul}
                onApply={(s) => setSoul(s)}
              />
            </div>
          )}
        </div>
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
