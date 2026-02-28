# Omnis — Knowledge Hub Redesign
_Date: 2026-02-28_

## Vision

Omnis becomes a hub of queryable knowledge experts. Each agent is a specialist that accumulates knowledge from any source and can be talked to directly — from the web UI, via REST, or as an MCP tool callable by any LLM.

---

## 1. Agent Model Unification

**Remove the `mode` field entirely.**

An agent is defined by:
- `SOUL.md` — the agent's identity, focus, and filters
- `half_life_days` — decay speed (short = trend-aware, long = evergreen expertise)
- `reflect_immediately` (bool, default `false`) — if true, each collected item immediately triggers a micro-consolidation instead of batching to INBOX.md

The old `accumulate`/`watch` distinction is absorbed: slow decay + broad soul ≈ accumulate, fast decay + news-focused soul ≈ watch. No config field required.

**Config schema changes:**
- Remove: `mode`
- Add: `reflect_immediately: bool`
- Sources: become a generic list (see Section 2)

---

## 2. Knowledge Pipeline (Unified)

### Source Plugins

Sources become pluggable via a `SourcePlugin` interface:

```python
class SourcePlugin:
    source_type: str  # "youtube", "url", "rss", "file"
    async def fetch(self, config: dict) -> list[SourceItem]
```

Agent config lists sources generically:
```yaml
sources:
  - type: youtube
    handle: "@ChannelHandle"
    check_schedule: "0 8 * * *"
  - type: rss
    url: "https://..."
    check_schedule: "0 */6 * * *"
  - type: url
    url: "https://..."
    check_schedule: "0 9 * * 1"
```

Implementations: `YouTubePlugin` (existing), `WebURLPlugin`, `RSSPlugin`, `FilePlugin`.

### Collection Flow (unchanged for batch mode)

```
SOURCE
  → SourcePlugin.fetch()
  → Analyze against SOUL.md → {insights, relevance_score, suggested_filing}
  → if reflect_immediately: micro-consolidation (see below)
  → else: append to INBOX.md
```

### Micro-Consolidation (reflect_immediately = true)

When `reflect_immediately` is enabled, each collected item immediately triggers a reflection step instead of batching:

1. Load current `_index.md` + top-N knowledge files by weight
2. LLM prompt: "You are {soul}. Here is what you know so far: {knowledge index}. You just learned: {new item}. Does this confirm, extend, or contradict your existing knowledge? Decide: update_concept / new_concept / new_recent. Then write the updated content."
3. Write/update the relevant knowledge file
4. Update `_index.md`
5. Regenerate `memory.md` (working memory) — see Section 3

Batch consolidation (existing weekly job) still runs and is still available — it serves as a "deep reflection" pass over accumulated inbox items.

---

## 3. Working Memory (memory.md)

`briefing.md` is renamed to **`memory.md`** and its role expands:

- Regenerated after every micro-consolidation (not just weekly)
- Richer structure: one paragraph per concept with weight, date range, and source links
- Source links point to the specific knowledge files: `[source](../concepts/topic.md)`
- Serves as the primary query context (Tier 1, see Section 4)

### memory.md format

```markdown
# [Agent ID] — Working Memory
_Last updated: 2026-02-28 14:32_

## Core Knowledge

### Price Action Basics [weight: 0.87, 2025-06–2026-02]
Support and resistance are the foundation of price action trading...
[source](../concepts/price-action-basics.md) [source](../concepts/support-resistance.md)

### Order Flow [weight: 0.72, 2025-09–2026-01]
Order flow reveals institutional intent through volume imbalances...
[source](../concepts/order-flow.md)

## Recent Developments (last 30 days)

### Liquidity Sweeps Trend [weight: 0.65, 2026-02]
ICT-style liquidity sweep setups gaining traction...
[source](../recent/2026-02/liquidity-sweeps.md)
```

---

## 4. Query / Chat Layer

### Tiered Context Loading

| Tier | Trigger | Context |
|------|---------|---------|
| 1 — Memory | Default | SOUL.md + memory.md |
| 2 — Recent | Query mentions: "latest", "recent", "trends", "today", "this week" | + last N days of `recent/` files |
| 3 — Deep | Query mentions a specific concept found in _index.md | + matching `concepts/` files |

The tier is selected by a lightweight heuristic on the query text. No embeddings needed.

### REST Endpoint

```
POST /api/agents/{id}/query
Content-Type: application/json
Body: {
  "message": "string",
  "history": [{"role": "user"|"assistant", "content": "string"}]
}

Response: text/event-stream (SSE)
data: {"token": "..."}\n\n
data: {"sources": ["knowledge/concepts/topic.md", ...]}\n\n
data: [DONE]\n\n
```

### Query Handler Logic

1. Select context tier based on query heuristic
2. Load SOUL.md + memory.md (always)
3. Optionally load additional files per tier
4. Build system prompt: "You are {soul}. Your knowledge: {context}"
5. Stream LLM response via SSE
6. After completion, emit `sources` event with file paths used

### Additional Endpoints

```
GET  /api/agents/{id}/memory          → return memory.md content
GET  /api/agents/{id}/knowledge       → list files (existing)
GET  /api/agents/{id}/knowledge/{path} → read file (existing)
```

---

## 5. MCP Server

A `omnis-mcp` entrypoint (separate process, same codebase) that implements the MCP protocol.

### Tools exposed

**`list_agents`**
```json
{ "agents": [{ "id": "...", "description": "...", "knowledge_count": 42, "last_updated": "..." }] }
```

**`ask_{agent_id}`** (one tool per registered agent, auto-generated on startup)
```
Input:  { "query": "string" }
Output: streamed text (MCP streaming response)
Description: first line of the agent's SOUL.md
```

### Configuration (for Claude Desktop / Claude Code / Cursor)

Users add Omnis as an MCP server once:
```json
{
  "mcpServers": {
    "omnis": {
      "command": "uv",
      "args": ["run", "python", "-m", "omnis_mcp"],
      "cwd": "/path/to/omnis"
    }
  }
}
```

All agents become available as tools automatically — no per-agent config.

### Implementation

The MCP server internally calls the same query handler as the REST endpoint. No duplicate logic.

Entrypoint: `main_mcp.py` (alongside existing `main.py`).
Framework: `mcp` Python SDK (fastmcp).

---

## 6. Web UI Changes

### Agent List

- Remove mode badge from cards
- Add direct "Chat" icon button on each card (jumps to chat mode)
- Show knowledge count + last activity
- "Deploy Agent" button unchanged

### Agent Detail — Dual Mode

The agent detail header gains a toggle pill:

```
[agent name]  [● Chat]  [○ Manage]
```

**Chat mode** (default):
- Full-width conversation panel
- Message input fixed at bottom
- Streamed token-by-token responses
- Source citations after each response (collapsible, link to knowledge file)
- Conversation history kept in browser session

**Manage mode** (existing dashboard, minimally changed):
- Left column: Config panel (remove mode field, add reflect_immediately toggle, generic sources list)
- Right column: Status panel + Knowledge browser
- Knowledge browser: gains "Memory" button that shows `memory.md` with clickable source links
- Floating FAB for "Feed Knowledge" (ingest) — unchanged

### No new routes needed

Chat mode lives within the existing `/agents/{id}` route via a React state toggle.

---

## 7. What Does NOT Change

- Collection pipeline (fetch → analyze → INBOX.md) — unchanged
- Weekly batch consolidation — kept as "deep reflection" pass
- SKILL.md generation — still produced after consolidation, still written to Claude Code plugins dir
- Knowledge file format (markdown + YAML frontmatter)
- State tracking (state.json, processed video IDs)
- Scheduler / APScheduler setup
- Existing API routes (agents, scheduler)
- SOUL.md editing

---

## 8. Phased Delivery

### Phase 1 — Query + Chat (highest value, self-contained)
- `POST /api/agents/{id}/query` (SSE streaming)
- Tiered context loading (memory.md-first)
- Chat tab in UI (Chat/Manage toggle)
- Rename briefing.md → memory.md, enrich format with source links

### Phase 2 — MCP Server
- `omnis-mcp` entrypoint
- `list_agents` + `ask_{id}` tools
- README / setup instructions

### Phase 3 — Mode Unification + Pluggable Sources
- Remove `mode` from config
- Add `reflect_immediately` toggle
- `SourcePlugin` interface + `WebURLPlugin` + `RSSPlugin`
- Update UI config panel

### Phase 4 — Micro-Consolidation
- `reflect_immediately` pipeline
- memory.md regeneration on each micro-consolidation
