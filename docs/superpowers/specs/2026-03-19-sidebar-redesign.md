# Sidebar & Soul Tab Redesign

**Date:** 2026-03-19
**Status:** Approved

---

## Problem

The Agent Inspector sidebar is 360px wide and tries to hold two sections: Soul editor and Configuration. When AI Assist is opened inside the Soul editor, both the textarea and `SoulAssistantPanel` (templates, quick actions, chat) are squeezed side-by-side within that 360px — unusable. Configuration is collapsed by default, so the evaluation questions buried at the bottom of `AgentForm` are never found.

---

## Design Decisions

1. **Soul moves to a first-class tab** with three sub-tabs: Edit · Evolve · Eval Questions
2. **The inspector sidebar becomes Config-only** — Soul section removed, renamed "Configuration"
3. **Evaluation questions move** from `AgentForm` → Soul tab → Eval Questions sub-tab

---

## Architecture

### Tab bar (AgentDetail manage mode)

Current tabs: Knowledge · Skill · Sources · Inbox · Session · Soul
No change to tab bar. The existing `soul` tab is repurposed.

### Soul tab — sub-tabs

```
Soul tab
├── Edit        (SoulEditor + SoulAssistantPanel, 50/50 split)
├── Evolve      (existing SoulEvolutionTab content, unchanged)
└── Eval Questions  (EvalQuestionsPanel — new, from AgentForm)
```

**Edit sub-tab:**
- Left column (flex: 1): `SoulEditor` — textarea + Save Soul button (unchanged component)
- Right column (flex: 1): `SoulAssistantPanel` — always visible, no toggle button needed
- Both columns are always shown; no "AI Assist" toggle button

**Evolve sub-tab:**
- Exact current `SoulEvolutionTab` content, no changes

**Eval Questions sub-tab:**
- New `EvalQuestionsPanel` component
- Fields extracted from `AgentForm`: `skillEvalPrompts` (multi-textarea) + `skillEvalThreshold` (range)
- Own save handler calling `useUpdateConfig`
- Same UI patterns as current AgentForm fields

### Config sidebar

Replaces the current `<aside>` inspector.

- Width: 360px (unchanged), always expanded (no collapse toggle)
- Header: renamed "Configuration" with gear icon
- **Two sections** (always expanded, no accordion):
  - **Pipeline**: Model (select), Analysis Mode (select), Collection Model (text), Consolidation Model (text), Daily Run Time (time), Self-Improving (toggle)
  - **Knowledge Decay**: Half-Life slider with min/max labels
- **Save Configuration** button at bottom
- Single `useUpdateConfig` call on save

---

## Component Changes

### Modified: `AgentDetail.tsx`

- Remove `inspectorOpen` state
- Remove `<Section title="Core Identity (Soul)">` + `<SoulEditor>` from sidebar
- Remove `<Section title="Configuration">` + `<AgentForm>` from sidebar
- Replace `<aside>` with new `<ConfigSidebar agentId={...} agent={...} />` component
- Soul tab: render `<SoulTab>` instead of `<SoulEvolutionTab>` directly

### New: `SoulTab.tsx`

Inner sub-tab component managing Edit · Evolve · Eval Questions navigation.

```tsx
type SoulSubTab = 'edit' | 'evolve' | 'eval';

interface SoulTabProps {
  agentId: string;
  agent: AgentDetail;                              // provides agent.soul, agent.has_soul_backup
  suggestionsData: { suggestions: string | null } | undefined;
  refetchSuggestions: () => void;
  isFetchingSuggestions: boolean;
}

export default function SoulTab({ agentId, agent, suggestionsData, refetchSuggestions, isFetchingSuggestions }: SoulTabProps) {
  const [subTab, setSubTab] = useState<SoulSubTab>('edit');
  const [soul, setSoul] = useState(agent.soul);    // soul state lifted here
  // renders sub-tab bar + content
}
```

**Soul state ownership:** `SoulTab` owns the `soul` string. Both `SoulEditor` and `SoulAssistantPanel` receive it as props. This requires refactoring `SoulEditor` from uncontrolled (own internal state) to controlled (value + onChange from parent).

Sub-tab bar styling: smaller, secondary to the main tab bar (e.g., 10px mono uppercase labels, lighter underline accent).

**Edit sub-tab layout:**
```
<div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
  <div style={{ flex: 1, padding: 20, borderRight: '1px solid border-subtle' }}>
    <SoulEditor agentId={agentId} soul={soul} onSoulChange={setSoul} />
  </div>
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <SoulAssistantPanel currentSoul={soul} onApply={setSoul} agentId={agentId} />
  </div>
</div>
```

### New: `ConfigSidebar.tsx`

Self-contained config form component.

```tsx
interface Props {
  agentId: string;
  agent: AgentDetail;
}
```

State: model, analysisMode, collectionModel, consolidationModel, runTime, halfLife, selfImproving
On save: `useUpdateConfig(agentId).mutateAsync({ model, analysis_mode, ... })`

Two always-visible sections with section headers (no accordion):
1. **Pipeline** — uses same `inputStyle`/`labelStyle` patterns as `AgentForm`
2. **Knowledge Decay** — half-life range slider with value display

### New: `EvalQuestionsPanel.tsx`

Extracted from `AgentForm`.

```tsx
interface Props {
  agentId: string;
  agent: AgentDetail;
}
```

State: skillEvalPrompts (string[]), skillEvalThreshold (number)
On save: `useUpdateConfig(agentId).mutateAsync({ skill_eval: { prompts, min_quality_threshold, enabled: true } })`

UI identical to current AgentForm eval section: numbered textareas, Add prompt button, threshold slider.

### Modified: `AgentForm.tsx`

- Remove the "Skill Quality Evaluation" section (lines ~252–338) — moves to `EvalQuestionsPanel`
- Keep soul field for create-only flow (`!isEdit`)
- Otherwise unchanged

### Modified: `SoulEditor.tsx`

- **Refactor to controlled component**: replace internal `soul` state + `initialSoul` prop with `soul: string` + `onSoulChange: (s: string) => void` props
- Remove `showAssistant` state and AI Assist toggle button
- Remove the side-by-side `SoulAssistantPanel` render
- Component becomes: controlled textarea + Save Soul button only
- `SoulAssistantPanel` is now rendered by `SoulTab` directly, sharing the same `soul`/`setSoul` state

---

## Data Flow

```
AgentDetail (manage mode)
├── [main content area]  flex: 1
│   ├── stat cards
│   ├── tab bar: Knowledge | Skill | Sources | Inbox | Session | Soul
│   └── tab content
│       └── soul tab → SoulTab
│           ├── sub-tab bar: Edit | Evolve | Eval Questions
│           ├── Edit → SoulEditor (left) + SoulAssistantPanel (right)
│           ├── Evolve → SoulEvolutionTab (unchanged)
│           └── Eval Questions → EvalQuestionsPanel
└── [ConfigSidebar]  width: 360px, borderLeft
    ├── header: "Configuration"
    ├── Pipeline section (always open)
    ├── Knowledge Decay section (always open)
    └── Save Configuration button
```

---

## Files to Create / Modify

| Action | File |
|--------|------|
| Modify | `web/src/components/AgentDetail.tsx` |
| Modify | `web/src/components/SoulEditor.tsx` |
| Modify | `web/src/components/AgentForm.tsx` |
| Create | `web/src/components/SoulTab.tsx` |
| Create | `web/src/components/ConfigSidebar.tsx` |
| Create | `web/src/components/EvalQuestionsPanel.tsx` |

---

## Out of Scope

- No changes to backend API or data types
- No changes to `SoulAssistantPanel`, `SoulEvolutionTab`, `KnowledgeBrowser`, `SkillTab`, `InboxPanel`, `SessionPanel`
- No changes to create-agent flow (`AgentForm` with `!isEdit`)
- No routing changes
