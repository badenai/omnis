# Inbox View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the "Inbox Items" stat card in StatusPanel clickable so it opens a slide-over that renders inbox entries as parsed, structured cards.

**Architecture:** New `InboxPanel.tsx` component handles fetching + parsing + rendering. `StatusPanel.tsx` gets an `onOpenInbox` prop to make its stat card a button. `AgentDetail.tsx` wires up state and renders the slide-over identically to the existing Ingest slide-over pattern.

**Tech Stack:** React, TypeScript, TanStack Query (`useInbox` hook already exists in `web/src/api/knowledge.ts`)

---

### Task 1: Create the inbox item parser

The inbox items returned by the API are raw markdown strings with a fixed format. We need a pure function to parse them into structured objects.

**Files:**
- Create: `web/src/components/InboxPanel.tsx`

**Background — inbox item format (from `core/inbox.py` `InboxWriter.append`):**

```
## 2026-02-28T12:00:00+00:00 | @SomeChannel | dQw4w9WgXcQ
**Title:** Some Video Title  
**Relevance Score:** 0.85  
**Suggested Action:** ingest -> `some/knowledge/path`

### Key Insights
- insight one
- insight two

### Summary
A raw summary text here.
```

**Step 1: Write the parser function and type**

Create `web/src/components/InboxPanel.tsx` with ONLY the parser (no JSX yet):

```typescript
export interface InboxItem {
  timestamp: string;
  channel: string;
  videoId: string;
  title: string;
  relevanceScore: number;
  suggestedAction: string;
  suggestedTarget: string;
  insights: string[];
  summary: string;
  raw: string;
}

export function parseInboxItem(raw: string): InboxItem {
  const lines = raw.split('\n');

  // Header: ## <timestamp> | <channel> | <videoId>
  const headerMatch = lines[0]?.match(/^##\s+(.+?)\s+\|\s+(.+?)\s+\|\s+(.+)$/);
  const timestamp = headerMatch?.[1]?.trim() ?? '';
  const channel = headerMatch?.[2]?.trim() ?? '';
  const videoId = headerMatch?.[3]?.trim() ?? '';

  // **Title:** ...
  const titleMatch = raw.match(/\*\*Title:\*\*\s*(.+)/);
  const title = titleMatch?.[1]?.trim() ?? '';

  // **Relevance Score:** ...
  const scoreMatch = raw.match(/\*\*Relevance Score:\*\*\s*([\d.]+)/);
  const relevanceScore = parseFloat(scoreMatch?.[1] ?? '0');

  // **Suggested Action:** <action> -> `<target>`
  const actionMatch = raw.match(/\*\*Suggested Action:\*\*\s*(\S+)\s*->\s*`([^`]+)`/);
  const suggestedAction = actionMatch?.[1]?.trim() ?? '';
  const suggestedTarget = actionMatch?.[2]?.trim() ?? '';

  // ### Key Insights section: bullet lines starting with "- "
  const insightsMatch = raw.match(/###\s+Key Insights\n([\s\S]*?)(?=###|$)/);
  const insightsBlock = insightsMatch?.[1] ?? '';
  const insights = insightsBlock
    .split('\n')
    .filter((l) => l.trim().startsWith('- '))
    .map((l) => l.replace(/^-\s*/, '').trim());

  // ### Summary section
  const summaryMatch = raw.match(/###\s+Summary\n([\s\S]*?)$/);
  const summary = summaryMatch?.[1]?.trim() ?? '';

  return { timestamp, channel, videoId, title, relevanceScore, suggestedAction, suggestedTarget, insights, summary, raw };
}
```

**Step 2: Verify the parser is syntactically correct**

Run: `cd web && npx tsc --noEmit`
Expected: No errors (the file has no JSX yet, just types and a function)

**Step 3: Commit**

```bash
git add web/src/components/InboxPanel.tsx
git commit -m "feat: add inbox item parser"
```

---

### Task 2: Build the InboxPanel component

**Files:**
- Modify: `web/src/components/InboxPanel.tsx`

**Step 1: Add the full component below the parser in `InboxPanel.tsx`**

Append this to the file (after the `parseInboxItem` function):

```typescript
import { useState } from 'react';
import { useInbox } from '../api/knowledge';
```

Wait — imports must be at the top. Replace the entire file content with:

```typescript
import { useState } from 'react';
import { useInbox } from '../api/knowledge';

export interface InboxItem {
  timestamp: string;
  channel: string;
  videoId: string;
  title: string;
  relevanceScore: number;
  suggestedAction: string;
  suggestedTarget: string;
  insights: string[];
  summary: string;
  raw: string;
}

export function parseInboxItem(raw: string): InboxItem {
  const lines = raw.split('\n');

  const headerMatch = lines[0]?.match(/^##\s+(.+?)\s+\|\s+(.+?)\s+\|\s+(.+)$/);
  const timestamp = headerMatch?.[1]?.trim() ?? '';
  const channel = headerMatch?.[2]?.trim() ?? '';
  const videoId = headerMatch?.[3]?.trim() ?? '';

  const titleMatch = raw.match(/\*\*Title:\*\*\s*(.+)/);
  const title = titleMatch?.[1]?.trim() ?? '';

  const scoreMatch = raw.match(/\*\*Relevance Score:\*\*\s*([\d.]+)/);
  const relevanceScore = parseFloat(scoreMatch?.[1] ?? '0');

  const actionMatch = raw.match(/\*\*Suggested Action:\*\*\s*(\S+)\s*->\s*`([^`]+)`/);
  const suggestedAction = actionMatch?.[1]?.trim() ?? '';
  const suggestedTarget = actionMatch?.[2]?.trim() ?? '';

  const insightsMatch = raw.match(/###\s+Key Insights\n([\s\S]*?)(?=###|$)/);
  const insightsBlock = insightsMatch?.[1] ?? '';
  const insights = insightsBlock
    .split('\n')
    .filter((l) => l.trim().startsWith('- '))
    .map((l) => l.replace(/^-\s*/, '').trim());

  const summaryMatch = raw.match(/###\s+Summary\n([\s\S]*?)$/);
  const summary = summaryMatch?.[1]?.trim() ?? '';

  return { timestamp, channel, videoId, title, relevanceScore, suggestedAction, suggestedTarget, insights, summary, raw };
}

// Score chip colour
function scoreColor(score: number): string {
  if (score >= 0.7) return 'var(--color-status-ok)';
  if (score >= 0.4) return 'var(--color-status-warn)';
  return 'var(--color-status-error)';
}

function scoreBg(score: number): string {
  if (score >= 0.7) return 'rgba(34,197,94,0.12)';
  if (score >= 0.4) return 'rgba(234,179,8,0.12)';
  return 'rgba(239,68,68,0.12)';
}

interface CardProps {
  item: InboxItem;
}

function InboxCard({ item }: CardProps) {
  const [expanded, setExpanded] = useState(false);

  const formattedTime = (() => {
    try {
      return new Date(item.timestamp).toLocaleString();
    } catch {
      return item.timestamp;
    }
  })();

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{
        backgroundColor: 'var(--color-surface-2)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {/* Top row: timestamp + channel */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span
          className="text-[10px]"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
        >
          {formattedTime}
        </span>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-accent)',
            backgroundColor: 'var(--color-accent-glow)',
            border: '1px solid var(--color-accent-dim)',
          }}
        >
          {item.channel}
        </span>
      </div>

      {/* Title */}
      <div className="text-sm font-medium leading-snug" style={{ color: 'var(--color-text-primary)' }}>
        {item.title || item.videoId}
      </div>

      {/* Chips row: score + action */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{
            fontFamily: 'var(--font-mono)',
            color: scoreColor(item.relevanceScore),
            backgroundColor: scoreBg(item.relevanceScore),
          }}
        >
          score {item.relevanceScore.toFixed(2)}
        </span>
        {item.suggestedAction && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-secondary)',
              backgroundColor: 'var(--color-surface-3)',
              border: '1px solid var(--color-border-default)',
            }}
          >
            {item.suggestedAction} → {item.suggestedTarget}
          </span>
        )}
      </div>

      {/* Expandable: insights + summary */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-[10px] flex items-center gap-1 transition-colors"
        style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
      >
        <svg
          className="w-3 h-3 transition-transform"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {expanded ? 'Collapse' : 'Show details'}
      </button>

      {expanded && (
        <div className="space-y-3 pt-1">
          {item.insights.length > 0 && (
            <div>
              <div
                className="text-[9px] uppercase tracking-widest mb-1.5"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
              >
                Key Insights
              </div>
              <ul className="space-y-1">
                {item.insights.map((ins, i) => (
                  <li
                    key={i}
                    className="text-xs flex gap-2"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <span style={{ color: 'var(--color-accent)', flexShrink: 0 }}>·</span>
                    {ins}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {item.summary && (
            <div>
              <div
                className="text-[9px] uppercase tracking-widest mb-1.5"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
              >
                Summary
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {item.summary}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  agentId: string;
}

export default function InboxPanel({ agentId }: Props) {
  const { data, isLoading } = useInbox(agentId);
  const items = (data?.items ?? []).map(parseInboxItem).reverse(); // newest first

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" style={{ color: 'var(--color-text-muted)' }}>
        <div
          className="w-4 h-4 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--color-accent-dim)', borderTopColor: 'var(--color-accent)' }}
        />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 gap-3"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p className="text-sm">Inbox is empty</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <InboxCard key={i} item={item} />
      ))}
    </div>
  );
}
```

**Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add web/src/components/InboxPanel.tsx
git commit -m "feat: add InboxPanel component with parsed cards"
```

---

### Task 3: Make the "Inbox Items" stat card clickable in StatusPanel

**Files:**
- Modify: `web/src/components/StatusPanel.tsx`

The "Inbox Items" stat card is currently a plain `<div>`. We need to make it a `<button>` when `onOpenInbox` is provided.

**Step 1: Add the `onOpenInbox` prop to the `Props` interface**

Find:
```typescript
interface Props {
  agent: AgentDetail;
}
```

Replace with:
```typescript
interface Props {
  agent: AgentDetail;
  onOpenInbox?: () => void;
}
```

**Step 2: Destructure the new prop in the component signature**

Find:
```typescript
export default function StatusPanel({ agent }: Props) {
```

Replace with:
```typescript
export default function StatusPanel({ agent, onOpenInbox }: Props) {
```

**Step 3: Replace the "Inbox Items" stat card div with a conditional button**

Find (the entire inbox stat card div):
```tsx
        <div
          className="rounded-lg px-4 py-3"
          style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)' }}
        >
          <div style={monoLabel}>Inbox Items</div>
          <div
            className="text-2xl font-medium leading-none"
            style={{ fontFamily: 'var(--font-mono)', color: agent.inbox_count > 0 ? 'var(--color-status-warn)' : 'var(--color-text-primary)' }}
          >
            {agent.inbox_count}
          </div>
        </div>
```

Replace with:
```tsx
        {onOpenInbox ? (
          <button
            onClick={onOpenInbox}
            className="rounded-lg px-4 py-3 text-left w-full transition-colors"
            style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-2)')}
          >
            <div style={monoLabel}>Inbox Items</div>
            <div
              className="text-2xl font-medium leading-none"
              style={{ fontFamily: 'var(--font-mono)', color: agent.inbox_count > 0 ? 'var(--color-status-warn)' : 'var(--color-text-primary)' }}
            >
              {agent.inbox_count}
            </div>
          </button>
        ) : (
          <div
            className="rounded-lg px-4 py-3"
            style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)' }}
          >
            <div style={monoLabel}>Inbox Items</div>
            <div
              className="text-2xl font-medium leading-none"
              style={{ fontFamily: 'var(--font-mono)', color: agent.inbox_count > 0 ? 'var(--color-status-warn)' : 'var(--color-text-primary)' }}
            >
              {agent.inbox_count}
            </div>
          </div>
        )}
```

**Step 4: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add web/src/components/StatusPanel.tsx
git commit -m "feat: make inbox stat card clickable"
```

---

### Task 4: Wire up the slide-over in AgentDetail

**Files:**
- Modify: `web/src/components/AgentDetail.tsx`

**Step 1: Import InboxPanel**

Find the existing imports at the top of `AgentDetail.tsx`:
```typescript
import IngestPanel from './IngestPanel';
```

Add after it:
```typescript
import InboxPanel from './InboxPanel';
```

**Step 2: Add `showInbox` state**

Find:
```typescript
  const [showIngest, setShowIngest] = useState(false);
```

Add after it:
```typescript
  const [showInbox, setShowInbox] = useState(false);
```

**Step 3: Pass `onOpenInbox` to StatusPanel**

Find:
```tsx
                  <StatusPanel agent={agent} />
```

Replace with:
```tsx
                  <StatusPanel agent={agent} onOpenInbox={() => setShowInbox(true)} />
```

**Step 4: Add the inbox slide-over**

The Ingest slide-over is rendered just before the closing `</div>` of the manage view content div. Add the inbox slide-over immediately after the existing Ingest slide-over block.

Find:
```tsx
            {/* Slide-over for Ingest */}
            {showIngest && (
```

Note the entire ingest slide-over block ends with `)}`. Add this immediately after the closing `)}` of that block:

```tsx
            {/* Slide-over for Inbox */}
            {showInbox && (
              <div
                className="fixed inset-0 z-40 flex justify-end"
                style={{ backgroundColor: 'rgba(8,8,9,0.7)' }}
                onClick={(e) => { if (e.target === e.currentTarget) setShowInbox(false); }}
              >
                <div
                  className="w-full max-w-md h-full p-6 overflow-y-auto animate-in slide-in-from-right duration-300"
                  style={{ backgroundColor: 'var(--color-surface-1)', borderLeft: '1px solid var(--color-border-subtle)' }}
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Inbox
                      </h3>
                      {agent.inbox_count > 0 && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-status-warn)',
                            backgroundColor: 'rgba(234,179,8,0.15)',
                          }}
                        >
                          {agent.inbox_count}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setShowInbox(false)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--color-text-muted)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-3)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <InboxPanel agentId={agent.agent_id} />
                </div>
              </div>
            )}
```

**Step 5: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add web/src/components/AgentDetail.tsx
git commit -m "feat: wire inbox slide-over in AgentDetail"
```

---

### Task 5: Manual verification

**Step 1: Start the dev server**

Run from the project root: `./Start-Dev.ps1` (or however dev is started)

**Step 2: Navigate to an agent detail page**

Go to `http://localhost:5173`, click an agent with inbox_count > 0.

**Step 3: Switch to Manage view and verify**

- "Inbox Items" stat card should have a hover effect (background lightens)
- Clicking it should open a slide-over from the right
- Slide-over header shows "Inbox" + item count badge
- Items render as cards with timestamp, channel, title, score chip, action chip
- "Show details" expands insights + summary
- Clicking the backdrop closes the slide-over
- X button closes the slide-over

**Step 4: Verify empty state**

Open an agent with `inbox_count = 0`. Clicking "Inbox Items" should show the empty state (envelope icon + "Inbox is empty").
