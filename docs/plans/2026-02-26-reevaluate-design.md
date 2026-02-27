# Reevaluate Feature Design

**Date:** 2026-02-26
**Status:** Approved

## Problem

When experimenting with different SOUL.md versions, the only way to see the effect on the knowledge base is to re-run the full collection pipeline — re-fetching YouTube videos, re-extracting transcripts, and re-running LLM analysis. This is expensive in both time and tokens.

A reevaluate function allows iterating on SOUL.md quickly by re-scoring existing knowledge files and regenerating the briefing and SKILL.md without touching the extraction phase.

## Approach

Batch re-scoring (one LLM call) + briefing + skill regeneration. All knowledge file content stays unchanged; only `relevance_score` frontmatter values are updated.

## Core Pipeline

New method `run_reevaluation()` on the existing `ConsolidationPipeline` class (`core/consolidation.py`).

Steps:
1. Load all knowledge files from `knowledge/concepts/` and `knowledge/recent/` via `KnowledgeWriter`
2. Exit early if no files exist
3. Call new `GeminiProvider.reevaluate_knowledge(files, soul)` — batch prompt returning `{relative_filename: new_score}` JSON
4. Update `relevance_score` frontmatter in each file on disk
5. Reload all files with `kw.load_all_weighted()` (using new scores)
6. Call `generate_briefing()` with re-weighted files + current SOUL.md
7. Call `generate_skill()` with new briefing + current SOUL.md
8. Write updated `briefing.md`, `SKILL.md`, and `_index.md`
9. Call `state.update_last_consolidation()` + `state.save()`

Job tracked in `job_status` under task name `"reevaluation"` with step-level progress messages.

### New LLM Method

`GeminiProvider.reevaluate_knowledge(files: list, soul: str) -> dict[str, float]`

Sends all knowledge files + SOUL.md in one batch prompt. Asks the model to score each file 0–1 based on how well its content matches the SOUL's stated interests. Returns `{filename: score}` mapping.

## API

New endpoint in `api/routers/scheduler.py`:

```
POST /api/scheduler/trigger/{agent_id}/reevaluate
```

Same pattern as consolidation trigger — schedules `pipeline.run_reevaluation` as an immediate APScheduler `date` job. Returns `{"status": "triggered", "job_id": ...}`. No new Pydantic schemas needed.

## UI

New **"Reevaluate Now"** button in `StatusPanel.tsx` alongside "Run Consolidation Now".

- New `useTriggerReevaluation(agentId)` React Query mutation hook in `web/src/api/scheduler.ts`
- Button shows loading spinner while mutation is in-flight
- Existing `ActivityPanel` shows reevaluation progress automatically via `job_status` polling

No new pages or components needed.

## Files to Change

| File | Change |
|---|---|
| `core/consolidation.py` | Add `run_reevaluation()` method |
| `core/models/gemini.py` | Add `reevaluate_knowledge()` method |
| `api/routers/scheduler.py` | Add `trigger_reevaluation` endpoint |
| `web/src/api/scheduler.ts` | Add `useTriggerReevaluation` hook |
| `web/src/components/StatusPanel.tsx` | Add "Reevaluate Now" button |
