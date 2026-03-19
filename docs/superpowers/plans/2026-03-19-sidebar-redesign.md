# Sidebar & Soul Tab Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Soul editing into a full-width tabbed panel with sub-tabs (Edit · Evolve · Eval Questions), and replace the inspector sidebar with a Config-only panel.

**Architecture:** `SoulTab` owns soul state and renders three sub-tabs; `SoulEditor` becomes a controlled component (no internal state); `EvalQuestionsPanel` extracts eval prompts from `AgentForm`; `ConfigSidebar` replaces the old `<aside>` inspector with pipeline + decay fields only.

**Tech Stack:** React 18, TypeScript, inline styles (no Tailwind/shadcn), React Query (`useUpdateConfig`, `useUpdateSoul` from `../api/agents`), Vite.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `web/src/components/SoulEditor.tsx` | Controlled textarea + Save Soul; no internal state |
| Create | `web/src/components/EvalQuestionsPanel.tsx` | skill_eval.prompts editor + threshold slider |
| Modify | `web/src/components/AgentForm.tsx` | Remove eval section (lines 252–338); keep create flow |
| Create | `web/src/components/SoulTab.tsx` | Sub-tab shell; owns soul state |
| Create | `web/src/components/ConfigSidebar.tsx` | Pipeline + decay config; Save button |
| Modify | `web/src/components/AgentDetail.tsx` | Wire SoulTab + ConfigSidebar; remove old aside |

---

## Task 1: Refactor SoulEditor to a controlled component

**Files:**
- Modify: `web/src/components/SoulEditor.tsx`

`SoulEditor` currently owns its own `soul` state (initialised from `initialSoul`) and has an AI Assist toggle that renders `SoulAssistantPanel` side-by-side. Both are being removed — soul state moves to `SoulTab`, and the assistant panel is rendered directly by `SoulTab`.

- [ ] **Step 1: Rewrite SoulEditor.tsx**

Replace the file with:

```tsx
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
        onChange={(e) => onSoulChange(e.target.value)}
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors in SoulEditor.tsx. Errors in AgentDetail.tsx (still uses old props) are expected and will be fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/SoulEditor.tsx
git commit -m "refactor: make SoulEditor a controlled component, remove AI Assist toggle"
```

---

## Task 2: Create EvalQuestionsPanel

**Files:**
- Create: `web/src/components/EvalQuestionsPanel.tsx`

This is a direct extraction of the "Skill Quality Evaluation" block from `AgentForm.tsx` (currently lines 252–338). The UI is identical — numbered textareas with add/remove, plus a threshold slider.

- [ ] **Step 1: Create EvalQuestionsPanel.tsx**

```tsx
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
          <Tooltip text="Alert when the latest SKILL.md quality score drops below this value. Range 0.0–1.0." />
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | grep EvalQuestions
```

Expected: no errors from EvalQuestionsPanel.tsx.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/EvalQuestionsPanel.tsx
git commit -m "feat: add EvalQuestionsPanel component"
```

---

## Task 3: Remove eval section from AgentForm

**Files:**
- Modify: `web/src/components/AgentForm.tsx`

The "Skill Quality Evaluation" block (the `div` starting with `borderTop` and `paddingTop: 16`, through to its closing tag before the `!isEdit` soul block) is now in `EvalQuestionsPanel`. Remove it and the related state.

- [ ] **Step 1: Remove the four state lines at the top of AgentForm**

Remove these four lines from the state declarations (~lines 111–116):
```tsx
const [skillEvalPrompts, setSkillEvalPrompts] = useState<string[]>(
  agent?.skill_eval?.prompts?.length ? agent.skill_eval.prompts : ['']
);
const [skillEvalThreshold, setSkillEvalThreshold] = useState(
  agent?.skill_eval?.min_quality_threshold ?? 0.6
);
```

- [ ] **Step 2: Remove skill_eval from the handleSubmit payload**

In `handleSubmit`, remove:
```tsx
const skillEval = {
  prompts: skillEvalPrompts.map(s => s.trim()).filter(Boolean),
  min_quality_threshold: skillEvalThreshold,
  enabled: true,
};
```
And remove `skill_eval: skillEval` from both `updateConfig.mutateAsync(...)` and `createAgent.mutateAsync(...)` calls.

- [ ] **Step 3: Remove the Skill Quality Evaluation JSX block**

Delete the entire JSX block starting with:
```tsx
<div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 16 }}>
  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', ...}}>
    Skill Quality Evaluation
```
...through its closing `</div>` (includes Test Prompts multi-textarea, Add prompt button, and Min Quality Threshold slider). This is approximately lines 252–338 in the current file.

- [ ] **Step 4: Verify TypeScript compiles with no new errors**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors from AgentForm.tsx. The create-agent flow (`!isEdit`) still works — the soul textarea and `SoulAssistantPanel` inside AgentForm are untouched.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/AgentForm.tsx
git commit -m "refactor: remove eval questions from AgentForm (moved to EvalQuestionsPanel)"
```

---

## Task 4: Create SoulTab

**Files:**
- Create: `web/src/components/SoulTab.tsx`

This component owns soul state and renders three sub-tabs. The Evolve sub-tab content is the existing `SoulEvolutionTab` function currently defined inside `AgentDetail.tsx` — move it to this file (or import it; since it's not exported, the simplest approach is to move the function here).

- [ ] **Step 1: Create SoulTab.tsx**

```tsx
import { useState } from 'react';
import type { AgentDetail } from '../types';
import SoulEditor from './SoulEditor';
import SoulAssistantPanel from './SoulAssistantPanel';
import EvalQuestionsPanel from './EvalQuestionsPanel';
import SoulEvolutionTab from './SoulEvolutionTab';

type SoulSubTab = 'edit' | 'evolve' | 'eval';

const SUB_TABS: { id: SoulSubTab; label: string }[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'evolve', label: 'Evolve' },
  { id: 'eval', label: 'Eval Questions' },
];

interface Props {
  agentId: string;
  agent: AgentDetail;
  suggestionsData: { suggestions: string | null } | undefined;
  refetchSuggestions: () => void;
  isFetchingSuggestions: boolean;
}

export default function SoulTab({ agentId, agent, suggestionsData, refetchSuggestions, isFetchingSuggestions }: Props) {
  const [subTab, setSubTab] = useState<SoulSubTab>('edit');
  const [soul, setSoul] = useState(agent.soul);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Sub-tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--color-border-subtle)',
        flexShrink: 0,
        padding: '0 6px',
        backgroundColor: 'var(--color-surface-2)',
      }}>
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            style={{
              padding: '8px 14px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: subTab === tab.id ? 600 : 400,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              border: 'none',
              borderBottom: subTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              backgroundColor: 'transparent',
              color: subTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              transition: 'all 150ms',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Edit sub-tab */}
      {subTab === 'edit' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <div style={{
            flex: 1,
            padding: 20,
            borderRight: '1px solid var(--color-border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <SoulEditor agentId={agentId} soul={soul} onSoulChange={setSoul} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <SoulAssistantPanel currentSoul={soul} onApply={setSoul} agentId={agentId} />
          </div>
        </div>
      )}

      {/* Evolve sub-tab */}
      {subTab === 'evolve' && (
        <SoulEvolutionTab
          agentId={agentId}
          soul={soul}
          hasSoulBackup={agent.has_soul_backup}
          suggestionsData={suggestionsData}
          refetchSuggestions={refetchSuggestions}
          isFetchingSuggestions={isFetchingSuggestions}
        />
      )}

      {/* Eval Questions sub-tab */}
      {subTab === 'eval' && (
        <EvalQuestionsPanel agentId={agentId} agent={agent} />
      )}
    </div>
  );
}
```

**Important:** `SoulEvolutionTab` is currently a private function inside `AgentDetail.tsx`. Before this compiles, you must extract it into its own file (next step).

- [ ] **Step 2: Extract SoulEvolutionTab into its own file**

Create `web/src/components/SoulEvolutionTab.tsx`.

Cut the following from `AgentDetail.tsx` and paste into the new file — the `parseSuggestions` helper is at **line 42** (before the interface), so the full range to cut is **lines 42–346**: `parseSuggestions` function (lines 42–68), `SoulEvolutionTabProps` interface (lines ~102–112), and `SoulEvolutionTab` function (lines ~113–346). Add the necessary imports at the top:

```tsx
import { useState, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { useUpdateSoul, useIntegrateSoul, useRevertSoul } from '../api/agents';
```

Export the function as default:
```tsx
export default function SoulEvolutionTab({ ... }: SoulEvolutionTabProps) { ... }
```

In `AgentDetail.tsx`, replace the inline function definition with:
```tsx
import SoulEvolutionTab from './SoulEvolutionTab';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors from SoulTab.tsx or SoulEvolutionTab.tsx.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/SoulTab.tsx web/src/components/SoulEvolutionTab.tsx web/src/components/AgentDetail.tsx
git commit -m "feat: add SoulTab with Edit/Evolve/Eval Questions sub-tabs; extract SoulEvolutionTab"
```

---

## Task 5: Create ConfigSidebar

**Files:**
- Create: `web/src/components/ConfigSidebar.tsx`

Standalone config panel. Fields: model, analysisMode, collectionModel, consolidationModel, runTime (converted from/to cron), halfLife, selfImproving. `cronToTime` and `timeToCron` helpers are copied from `AgentForm`.

- [ ] **Step 1: Create ConfigSidebar.tsx**

```tsx
import { useState } from 'react';
import { useUpdateConfig } from '../api/agents';
import type { AgentDetail } from '../types';

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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | grep ConfigSidebar
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/ConfigSidebar.tsx
git commit -m "feat: add ConfigSidebar component (pipeline + decay, no soul)"
```

---

## Task 6: Wire AgentDetail

**Files:**
- Modify: `web/src/components/AgentDetail.tsx`

This task plugs the new components in and removes the old inspector `<aside>`. The key changes:
1. Add imports for `SoulTab` and `ConfigSidebar`
2. Remove imports for `SoulEditor` and `AgentForm` (still used in create flow — check if `AgentForm` is still rendered anywhere in this file before removing the import)
3. Remove `inspectorOpen` state and the `Section` component
4. Replace the soul tab's content render with `<SoulTab>`
5. Replace the `<aside>` block with `<ConfigSidebar>`

- [ ] **Step 1: Add new imports**

At the top of `AgentDetail.tsx`, add:
```tsx
import SoulTab from './SoulTab';
import ConfigSidebar from './ConfigSidebar';
```

- [ ] **Step 2: Remove `inspectorOpen` state and the `Section` component**

Delete the `inspectorOpen` state line:
```tsx
const [inspectorOpen, setInspectorOpen] = useState(true);
```

Delete the entire `Section` component function (lines 84–100 approximately).

- [ ] **Step 3: Replace the soul tab content in the tab switcher**

Find the soul tab render block (~line 1104):
```tsx
{activeTab === 'soul' && (
  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <SoulEvolutionTab
      agentId={agent.agent_id}
      soul={agent.soul}
      hasSoulBackup={agent.has_soul_backup}
      suggestionsData={suggestionsData}
      refetchSuggestions={refetchSuggestions}
      isFetchingSuggestions={isFetchingSuggestions}
    />
  </div>
)}
```

Replace with:
```tsx
{activeTab === 'soul' && (
  <SoulTab
    agentId={agent.agent_id}
    agent={agent}
    suggestionsData={suggestionsData}
    refetchSuggestions={refetchSuggestions}
    isFetchingSuggestions={isFetchingSuggestions}
  />
)}
```

- [ ] **Step 4: Replace the `<aside>` inspector block with ConfigSidebar**

Find the entire `<aside style={{ width: inspectorOpen ? 360 : 40, ... }}>...</aside>` block (~lines 1122–1186) and replace it with:

```tsx
<ConfigSidebar agentId={agent.agent_id} agent={agent} />
```

- [ ] **Step 5: Clean up now-unused imports**

Remove from imports:
- `SoulEditor` (now imported by SoulTab.tsx)

Note: `SoulEvolutionTab` was never an import in `AgentDetail.tsx` — it was an inline function definition that was already cut to its own file in Task 4, Step 2. Nothing to do for it here.

Check if `AgentForm` is still needed. It is still used in the create-agent modal elsewhere (the `CreateAgent` component), but if it's not rendered anywhere in `AgentDetail.tsx` after this change, remove it from the imports in this file only.

- [ ] **Step 6: Verify TypeScript compiles clean**

```bash
cd web && npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 7: Start dev server and verify visually**

```bash
cd web && npm run dev
```

Navigate to an agent's manage view. Verify:
- Soul tab shows sub-tab bar: Edit · Evolve · Eval Questions
- Edit sub-tab: textarea on left fills height, SoulAssistantPanel on right
- Evolve sub-tab: evolution suggestions (same as before)
- Eval Questions sub-tab: numbered textareas and threshold slider
- Right sidebar header shows "Configuration" with gear icon
- Pipeline section shows all fields; Knowledge Decay section shows half-life slider
- Save Configuration button works (triggers updateConfig)
- No old "Agent Inspector" header or collapse toggle

- [ ] **Step 8: Commit**

```bash
git add web/src/components/AgentDetail.tsx
git commit -m "feat: wire SoulTab and ConfigSidebar into AgentDetail, remove inspector aside"
```

---

## Done

All 6 tasks complete. The manage view now has:
- Full-width Soul tab with Edit · Evolve · Eval Questions sub-tabs
- Config-only right sidebar (360px, always expanded)
- Eval questions accessible at Soul → Eval Questions
