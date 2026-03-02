# Session Panel Design — 2026-03-02

## Summary

Add a Session panel to the agent detail page that shows the output of the latest
consolidation run: a session report, a side-by-side SKILL diff, and a side-by-side
digest diff. Uses `react-diff-viewer-continued` for the split diff view.

---

## Architecture

Three layers of change:

1. **2 new API endpoints** in `api/routers/knowledge.py` — `skill-diff` and
   `digest-diff`, each returning `{ old_content, new_content }` (the `.previous.md`
   + current `.md` file pair). `last_session.md` is served by a `session-report`
   endpoint. `react-diff-viewer-continued` takes two strings so we serve the file
   pair directly rather than parsing the `.diff` files.

2. **1 new `SessionPanel` component** — three tabs: Session Report (markdown),
   SKILL Diff (split diff), Digest Diff (split diff).

3. **Small change to `AgentDetail.tsx`** — add a `"Knowledge" | "Session"` pill
   toggle above the right column; swap `KnowledgeBrowser` for `SessionPanel`.

---

## API Endpoints

All added to `api/routers/knowledge.py`.

```
GET /api/knowledge/{agent_id}/session-report
→ { content: string }
→ 404 if last_session.md not found

GET /api/knowledge/{agent_id}/skill-diff
→ { old_content: string | null, new_content: string }
   old_content = SKILL.previous.md (null on first run)
   new_content = SKILL.md
→ 404 if SKILL.md not found

GET /api/knowledge/{agent_id}/digest-diff
→ { old_content: string | null, new_content: string }
   old_content = digest.previous.md (null on first run)
   new_content = digest.md
→ 404 if digest.md not found
```

Three hooks added to `web/src/api/knowledge.ts`:
`useSessionReport`, `useSkillDiff`, `useDigestDiff`.

---

## SessionPanel Component

File: `web/src/components/SessionPanel.tsx`

Three tabs (local state, no routing):

- **Session Report** — renders `last_session.md` with `<Markdown>` + existing
  prose classes. Empty state: *"No session yet. Run a consolidation."*

- **SKILL Diff** / **Digest Diff** — `<ReactDiffViewer splitView={true}>`.
  `oldValue = old_content ?? ""`, `newValue = new_content`.
  First-run banner when `old_content` is null.
  Custom `styles` prop to match zinc/slate dark theme.

Tab bar uses the same pill button style as the chat/manage toggle.

---

## AgentDetail Integration

File: `web/src/components/AgentDetail.tsx`

- Add `rightPanel: 'knowledge' | 'session'` local state (default: `'knowledge'`)
- Replace right-column heading with two-pill toggle: `[ Knowledge ] [ Session ]`
- Conditionally render `KnowledgeBrowser` or `SessionPanel`
- State resets when navigating to a different agent

---

## Empty States

| Situation | Shown |
|-----------|-------|
| No consolidation run | "No session yet. Run a consolidation to see results here." |
| First run (no previous version) | Banner: "First run — no previous version to compare." |
| Identical output (no diff) | Both sides identical; diff viewer shows no changes |
