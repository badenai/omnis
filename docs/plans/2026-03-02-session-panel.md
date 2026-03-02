# Session Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Session panel to the agent detail page showing `last_session.md`, a side-by-side SKILL diff, and a side-by-side digest diff from the latest consolidation run.

**Architecture:** Three new API endpoints serve `last_session.md`, `SKILL.previous.md`+`SKILL.md`, and `digest.previous.md`+`digest.md`. A new `SessionPanel` component renders these in three tabs using `react-diff-viewer-continued` for split diffs. `AgentDetail` gains a Knowledge/Session pill toggle that swaps out the right panel.

**Tech Stack:** FastAPI (Python), React 19 + TypeScript, Tailwind CSS, `@tanstack/react-query`, `react-diff-viewer-continued`

---

### Task 1: Install react-diff-viewer-continued

**Files:**
- Modify: `web/package.json` (via npm install)

**Step 1: Install the package**

```bash
cd web && npm install react-diff-viewer-continued
```

Expected: package added to `dependencies` in `package.json`, `package-lock.json` updated.

**Step 2: Verify the import resolves**

```bash
cd web && node -e "require.resolve('react-diff-viewer-continued')" && echo "OK"
```

Expected: prints `OK` (no module-not-found error).

---

### Task 2: Add API endpoints

**Files:**
- Modify: `api/routers/knowledge.py` (append 3 endpoints after the existing `read_inbox`)
- Create: `tests/test_session_endpoints.py`

**Step 1: Write the failing tests**

Create `tests/test_session_endpoints.py`:

```python
import pathlib
import pytest
from fastapi.testclient import TestClient
from core.models.types import AgentConfig


def _make_app(tmp_path):
    from api.app import create_app
    app = create_app()
    config = AgentConfig(
        agent_id="test-agent", model="gemini",
        analysis_mode="transcript_only", sources={},
        consolidation_schedule="0 3 * * 0", decay={"half_life_days": 365},
    )
    app.state.agents = {
        "test-agent": {"config": config, "dir": tmp_path, "soul": "", "provider": None}
    }
    return app


def test_session_report_returns_content(tmp_path):
    (tmp_path / "last_session.md").write_text("# Session Report", encoding="utf-8")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/session-report")
    assert r.status_code == 200
    assert r.json()["content"] == "# Session Report"


def test_session_report_404_when_missing(tmp_path):
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/session-report")
    assert r.status_code == 404


def test_skill_diff_returns_old_and_new(tmp_path):
    (tmp_path / "SKILL.md").write_text("new skill", encoding="utf-8")
    (tmp_path / "SKILL.previous.md").write_text("old skill", encoding="utf-8")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/skill-diff")
    assert r.status_code == 200
    assert r.json()["old_content"] == "old skill"
    assert r.json()["new_content"] == "new skill"


def test_skill_diff_null_old_when_no_previous(tmp_path):
    (tmp_path / "SKILL.md").write_text("first skill", encoding="utf-8")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/skill-diff")
    assert r.status_code == 200
    assert r.json()["old_content"] is None
    assert r.json()["new_content"] == "first skill"


def test_skill_diff_404_when_no_skill(tmp_path):
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/skill-diff")
    assert r.status_code == 404


def test_digest_diff_returns_old_and_new(tmp_path):
    (tmp_path / "digest.md").write_text("new digest", encoding="utf-8")
    (tmp_path / "digest.previous.md").write_text("old digest", encoding="utf-8")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/digest-diff")
    assert r.status_code == 200
    assert r.json()["old_content"] == "old digest"
    assert r.json()["new_content"] == "new digest"


def test_digest_diff_404_when_no_digest(tmp_path):
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/knowledge/test-agent/digest-diff")
    assert r.status_code == 404
```

**Step 2: Run to verify they fail**

```bash
python -m pytest tests/test_session_endpoints.py -v --tb=short
```

Expected: 7 FAILs / ERRORs (endpoints don't exist yet).

**Step 3: Add the three endpoints to `api/routers/knowledge.py`**

Append after the `read_inbox` function (after line 79):

```python
@router.get("/{agent_id}/session-report")
def read_session_report(agent_id: str, request: Request):
    agent = _get_agent(agent_id, request)
    path = agent["dir"] / "last_session.md"
    if not path.exists():
        raise HTTPException(404, "last_session.md not found")
    return {"content": path.read_text(encoding="utf-8")}


@router.get("/{agent_id}/skill-diff")
def read_skill_diff(agent_id: str, request: Request):
    agent = _get_agent(agent_id, request)
    skill_path = agent["dir"] / "SKILL.md"
    if not skill_path.exists():
        raise HTTPException(404, "SKILL.md not found")
    previous_path = agent["dir"] / "SKILL.previous.md"
    old_content = previous_path.read_text(encoding="utf-8") if previous_path.exists() else None
    return {"old_content": old_content, "new_content": skill_path.read_text(encoding="utf-8")}


@router.get("/{agent_id}/digest-diff")
def read_digest_diff(agent_id: str, request: Request):
    agent = _get_agent(agent_id, request)
    digest_path = agent["dir"] / "digest.md"
    if not digest_path.exists():
        raise HTTPException(404, "digest.md not found")
    previous_path = agent["dir"] / "digest.previous.md"
    old_content = previous_path.read_text(encoding="utf-8") if previous_path.exists() else None
    return {"old_content": old_content, "new_content": digest_path.read_text(encoding="utf-8")}
```

**Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/test_session_endpoints.py -v
```

Expected: 7 passed.

---

### Task 3: Add React Query hooks

**Files:**
- Modify: `web/src/api/knowledge.ts` (append 3 hooks)

**Step 1: Append the three hooks to `web/src/api/knowledge.ts`**

```typescript
export function useSessionReport(agentId: string) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'session-report'],
    queryFn: () => apiFetch<{ content: string }>(`/knowledge/${agentId}/session-report`),
    enabled: !!agentId,
    retry: false,
  });
}

export function useSkillDiff(agentId: string) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'skill-diff'],
    queryFn: () => apiFetch<{ old_content: string | null; new_content: string }>(`/knowledge/${agentId}/skill-diff`),
    enabled: !!agentId,
    retry: false,
  });
}

export function useDigestDiff(agentId: string) {
  return useQuery({
    queryKey: ['knowledge', agentId, 'digest-diff'],
    queryFn: () => apiFetch<{ old_content: string | null; new_content: string }>(`/knowledge/${agentId}/digest-diff`),
    enabled: !!agentId,
    retry: false,
  });
}
```

`retry: false` prevents repeated 404 requests when no session has run yet.

**Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

---

### Task 4: Create SessionPanel component

**Files:**
- Create: `web/src/components/SessionPanel.tsx`

**Step 1: Create `web/src/components/SessionPanel.tsx`**

```tsx
import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { useSessionReport, useSkillDiff, useDigestDiff } from '../api/knowledge';

interface Props {
  agentId: string;
}

type Tab = 'report' | 'skill' | 'digest';

const TABS: { id: Tab; label: string }[] = [
  { id: 'report', label: 'Session Report' },
  { id: 'skill', label: 'SKILL Diff' },
  { id: 'digest', label: 'Digest Diff' },
];

const diffStyles = {
  variables: {
    dark: {
      diffViewerBackground: 'var(--color-surface-2)',
      addedBackground: 'rgba(34,197,94,0.12)',
      addedColor: '#86efac',
      removedBackground: 'rgba(239,68,68,0.12)',
      removedColor: '#fca5a5',
      wordAddedBackground: 'rgba(34,197,94,0.25)',
      wordRemovedBackground: 'rgba(239,68,68,0.25)',
      addedGutterBackground: 'rgba(34,197,94,0.08)',
      removedGutterBackground: 'rgba(239,68,68,0.08)',
      gutterBackground: 'var(--color-surface-1)',
      gutterBackgroundDark: 'var(--color-surface-2)',
      highlightBackground: 'rgba(99,102,241,0.1)',
      highlightGutterBackground: 'rgba(99,102,241,0.1)',
      codeFoldBackground: 'var(--color-surface-3)',
      emptyLineBackground: 'var(--color-surface-2)',
      gutterColor: 'var(--color-text-muted)',
      addedGutterColor: '#86efac',
      removedGutterColor: '#fca5a5',
      codeFoldContentColor: 'var(--color-text-secondary)',
      diffViewerTitleBackground: 'var(--color-surface-1)',
      diffViewerTitleColor: 'var(--color-text-primary)',
      diffViewerTitleBorderColor: 'var(--color-border-subtle)',
    },
  },
};

function DiffPane({
  data,
  isLoading,
  fileName,
}: {
  data: { old_content: string | null; new_content: string } | undefined;
  isLoading: boolean;
  fileName: string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-text-muted)' }}>
        <span className="text-sm">Loading...</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-text-muted)' }}>
        <span className="text-sm">No data yet. Run a consolidation to see results here.</span>
      </div>
    );
  }
  return (
    <div className="overflow-auto h-full">
      {data.old_content === null && (
        <div
          className="px-4 py-2 text-xs mb-2 rounded-lg"
          style={{
            color: 'var(--color-status-warn)',
            backgroundColor: 'rgba(234,179,8,0.08)',
            border: '1px solid rgba(234,179,8,0.2)',
          }}
        >
          First run — no previous version to compare.
        </div>
      )}
      <ReactDiffViewer
        oldValue={data.old_content ?? ''}
        newValue={data.new_content}
        splitView={true}
        useDarkTheme={true}
        compareMethod={DiffMethod.WORDS}
        styles={diffStyles}
        leftTitle={data.old_content !== null ? `${fileName}.previous` : '(none)'}
        rightTitle={fileName}
        hideLineNumbers={false}
      />
    </div>
  );
}

export default function SessionPanel({ agentId }: Props) {
  const [tab, setTab] = useState<Tab>('report');

  const { data: reportData, isLoading: reportLoading } = useSessionReport(agentId);
  const { data: skillDiff, isLoading: skillLoading } = useSkillDiff(agentId);
  const { data: digestDiff, isLoading: digestLoading } = useDigestDiff(agentId);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div
        className="flex items-center gap-1 p-1 rounded-lg mb-3 shrink-0 self-start"
        style={{ backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-border-default)' }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150"
            style={{
              backgroundColor: tab === t.id ? 'var(--color-accent)' : 'transparent',
              color: tab === t.id ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto border rounded-lg"
        style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-surface-2)' }}
      >
        {tab === 'report' && (
          reportLoading ? (
            <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-text-muted)' }}>
              <span className="text-sm">Loading...</span>
            </div>
          ) : reportData ? (
            <div className="p-4 prose prose-invert prose-sm max-w-none prose-headings:text-gray-100 prose-p:text-gray-300 prose-strong:text-gray-100 prose-code:text-indigo-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700 prose-table:text-sm prose-th:text-gray-300 prose-td:text-gray-400 prose-a:text-indigo-400 prose-li:text-gray-300 prose-blockquote:border-indigo-500 prose-blockquote:text-gray-400 prose-hr:border-gray-700">
              <Markdown remarkPlugins={[remarkGfm]}>{reportData.content}</Markdown>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-text-muted)' }}>
              <span className="text-sm">No session yet. Run a consolidation to see results here.</span>
            </div>
          )
        )}

        {tab === 'skill' && (
          <DiffPane data={skillDiff} isLoading={skillLoading} fileName="SKILL.md" />
        )}

        {tab === 'digest' && (
          <DiffPane data={digestDiff} isLoading={digestLoading} fileName="digest.md" />
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

---

### Task 5: Wire SessionPanel into AgentDetail

**Files:**
- Modify: `web/src/components/AgentDetail.tsx`

**Step 1: Add import and state**

At the top of `AgentDetail.tsx`, add the import after the existing imports:

```typescript
import SessionPanel from './SessionPanel';
```

Inside the `AgentDetail` function, after the existing `useState` calls (after line 29), add:

```typescript
const [rightPanel, setRightPanel] = useState<'knowledge' | 'session'>('knowledge');
```

**Step 2: Replace the Knowledge Brain panel header with a toggle + conditional render**

Find this block in `AgentDetail.tsx` (lines ~171–182):

```tsx
                <div
                  className="rounded-xl p-5 flex-1 min-h-[500px] flex flex-col"
                  style={{ backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-border-subtle)' }}
                >
                  <div style={sectionHeading}>Knowledge Brain</div>
                  <div
                    className="flex-1 overflow-hidden relative rounded-xl"
                    style={{ border: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-surface-2)' }}
                  >
                    <KnowledgeBrowser agentId={agent.agent_id} />
                  </div>
                </div>
```

Replace with:

```tsx
                <div
                  className="rounded-xl p-5 flex-1 min-h-[500px] flex flex-col"
                  style={{ backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-border-subtle)' }}
                >
                  {/* Toggle */}
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className="flex items-center rounded-lg p-0.5"
                      style={{ backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-border-default)' }}
                    >
                      {(['knowledge', 'session'] as const).map((panel) => (
                        <button
                          key={panel}
                          onClick={() => setRightPanel(panel)}
                          className="px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors duration-150"
                          style={{
                            backgroundColor: rightPanel === panel ? 'var(--color-accent)' : 'transparent',
                            color: rightPanel === panel ? '#fff' : 'var(--color-text-secondary)',
                          }}
                        >
                          {panel === 'knowledge' ? 'Knowledge' : 'Session'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div
                    className="flex-1 overflow-hidden relative rounded-xl"
                    style={{ border: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-surface-2)' }}
                  >
                    {rightPanel === 'knowledge' ? (
                      <KnowledgeBrowser agentId={agent.agent_id} />
                    ) : (
                      <div className="p-4 h-full flex flex-col">
                        <SessionPanel agentId={agent.agent_id} />
                      </div>
                    )}
                  </div>
                </div>
```

**Step 3: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

**Step 4: Run the full test suite**

```bash
python -m pytest --ignore=tests/test_query_endpoint.py --ignore=tests/test_mcp_server.py -q
```

Expected: all tests pass (same as before + 7 new session endpoint tests).

---

### Task 6: Manual verification

**Step 1: Start the dev server**

```bash
# Terminal 1 — backend
uv run python -m uvicorn api.app:app --reload --port 8420

# Terminal 2 — frontend
cd web && npm run dev
```

**Step 2: Open http://localhost:5173, navigate to an agent, switch to Manage view**

Verify:
- Right column header now shows `[ Knowledge ] [ Session ]` pill toggle
- Clicking Knowledge shows the existing KnowledgeBrowser (no regression)
- Clicking Session shows the three-tab panel (Session Report / SKILL Diff / Digest Diff)

**Step 3: Test empty state**

If no consolidation has run for this agent: all three tabs should show the "No data yet" / "No session yet" message. No errors in the browser console.

**Step 4: Test with real data**

Trigger a consolidation: `POST http://localhost:8420/api/scheduler/trigger/<agent-id>/consolidate`

After it completes:
- Session Report tab renders `last_session.md` as markdown with tables
- SKILL Diff tab: if first run → first-run banner + full content as additions; if second run → side-by-side split diff with red/green highlighting
- Digest Diff tab: same behaviour
