# Channel Scan Feature Design

**Date:** 2026-02-28

## Overview

When a user manually pastes a YouTube channel URL into the Ingest Panel, the system fetches all videos from the channel, screens them against the agent's soul using a single batch AI call, fully analyzes only matching videos, and marks all fetched videos as processed so the scheduler skips them in future runs.

---

## Data Flow

```
User pastes channel URL
        ↓
IngestPanel detects channel URL pattern
        ↓
POST /ingest/channel/preview  (fast, synchronous)
        ↓
Returns { count, videos: [{id, title, description}] }
        ↓
count > 50?
  yes → show warning + 3 buttons (First 50 / All / Cancel)
  no  → proceed automatically
        ↓
POST /ingest/channel/execute  { url, limit }
        ↓ (background job)
fetch video list (up to limit)
        ↓
one Gemini flash call: batch screen all titles+descriptions against soul
        ↓
matched → full analysis (transcript or video) → inbox
not matched → skipped
        ↓
ALL fetched videos marked as processed in agent state
```

---

## Backend Changes

### `core/collector.py`
- `is_channel_url(url) -> bool` — matches `/@handle`, `/c/name`, `/channel/UC...`, `/user/name` but NOT `/watch?v=`
- `get_channel_videos(url, limit=None) -> list[dict]` — like `get_new_videos` but no `playlistend` cap (or sets it to `limit`), no `processed_ids` filtering, returns `id + title + description`

### `core/models/gemini.py`
- `screen_videos(videos: list[dict], soul: str) -> list[str]` — single Gemini flash call, sends all `{id, title, description}` pairs, asks which are relevant to the soul, returns list of matching video IDs

### `core/manual_ingestion.py`
- `ManualIngestionPipeline.run_channel(url: str, limit: int | None) -> None` — orchestrates: fetch → screen → analyze matches → mark all as processed in `AgentState`

### `api/routers/agents.py`
- `POST /agents/{agent_id}/ingest/channel/preview` — synchronous, returns `{count, videos}`
- `POST /agents/{agent_id}/ingest/channel/execute` — body `{url, limit: int | None}`, starts background task

---

## Frontend Changes

### `IngestPanel.tsx`
- On URL input change, run channel URL regex check
- If channel URL detected: show "Scan Channel" button instead of normal "Ingest" button
- On click: call preview endpoint, show spinner
- If `count > 50`: show inline warning with count + 3 buttons — **First 50**, **All**, **Cancel**
- If `count ≤ 50`: skip dialog, call execute directly
- After execute called: poll job activity for progress as usual

### Channel URL patterns (frontend regex)
```
youtube.com/@handle
youtube.com/c/name
youtube.com/channel/UCxxx
youtube.com/user/name
```

No new components needed — all inline within existing `IngestPanel`.

---

## Key Decisions

- **Two-step API** (preview + execute) keeps counting fast/synchronous and processing async
- **Batch screening** — one Gemini flash call for all videos, not per-video calls
- **All fetched videos marked processed** — both matched and screened-out, so the scheduler never re-attempts them
- **No new UI components** — warning and options rendered inline in IngestPanel
