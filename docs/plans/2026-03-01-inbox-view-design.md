# Inbox View Design

**Date:** 2026-03-01  
**Status:** Approved

## Problem

The "Inbox Items" count is already shown as a stat card in the Status & Telemetry panel, but there is no way to actually read the inbox contents from the UI. The API endpoint and React hook already exist.

## Solution

Make the "Inbox Items" stat card clickable. Clicking it opens a slide-over panel (same pattern as the Ingest panel) that shows parsed inbox entries as structured cards.

## Architecture

### New component: `InboxPanel.tsx`

- Receives `agentId: string`
- Calls `useInbox(agentId)` to fetch items
- Parses each raw markdown string via a `parseInboxItem()` helper
- Renders a scrollable list of cards

### Modified: `StatusPanel.tsx`

- Accepts new optional prop `onOpenInbox?: () => void`
- "Inbox Items" stat card becomes a clickable button with hover state when `onOpenInbox` is provided

### Modified: `AgentDetail.tsx`

- Adds `showInbox` state (boolean, default false)
- Passes `onOpenInbox={() => setShowInbox(true)}` to `StatusPanel`
- Renders the inbox slide-over (same `fixed inset-0 z-40` pattern as Ingest)

## Parsing

Each inbox item is a markdown string with a fixed format written by `InboxWriter.append()`:

```
## <ISO timestamp> | <channel handle> | <video_id>
**Title:** <title>  
**Relevance Score:** <score>  
**Suggested Action:** <action> -> `<target>`

### Key Insights
- <insight>
...

### Summary
<raw summary>
```

The `parseInboxItem(raw: string)` function extracts:
- `timestamp` — ISO string from the header
- `channel` — channel handle
- `videoId` — YouTube video ID
- `title` — video title
- `relevanceScore` — numeric (0–10)
- `suggestedAction` — e.g. "ingest"
- `suggestedTarget` — e.g. knowledge file path
- `insights` — string array
- `summary` — remainder text

## InboxPanel Card Layout

Each card (newest-first) shows:
- **Top row:** formatted timestamp + channel handle
- **Title** (prominent text)
- **Chips row:** relevance score (color-coded: green ≥7, yellow ≥4, red <4) + `suggestedAction → target`
- **Expandable section:** insights (bullet list) + summary — collapsed by default, expand on click

## Files Changed

| File | Change |
|------|--------|
| `web/src/components/InboxPanel.tsx` | New component |
| `web/src/components/StatusPanel.tsx` | Add `onOpenInbox` prop, make stat card clickable |
| `web/src/components/AgentDetail.tsx` | Add `showInbox` state + slide-over render |
