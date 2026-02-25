# Knowledge Agent System (cloracle) - Design Document

**Date:** 2026-02-25
**Status:** Approved
**Project:** cloracle

---

## Vision

A local Python service that runs knowledge agents with a heartbeat. Each agent monitors information sources (YouTube channels initially), accumulates domain knowledge over time, and exposes that knowledge as a Claude Code-compatible `SKILL.md` that can be injected into implementation agents as structured context.

The system is inspired by [OpenClaw's](https://github.com/openclaw/openclaw) workspace-per-agent pattern, SOUL.md identity files, and skill-as-file architecture.

---

## Goals

1. **Autonomous knowledge accumulation** - agents check sources on a schedule without manual intervention
2. **Structured output for other agents** - distilled `briefing.md` + auto-generated `SKILL.md` per agent
3. **Long-lived knowledge graphs** - knowledge evolves, newer info is weighted higher, old info decays gracefully
4. **Two operating modes** - deep domain knowledge (`accumulate`) vs. current events (`watch`)
5. **Model-agnostic** - Gemini as default (native YouTube URL support), easy to swap

---

## Non-Goals

- No web UI or dashboard (files are the interface)
- No vector database or embedding search (Markdown + frontmatter is sufficient)
- No multi-user or remote deployment (local-only)
- No sources beyond YouTube (in this version)

---

## Architecture

### Directory Layout

```
~/.cloracle/                         # global workspace (runtime data)
  registry.json                      # all agents + their SKILL.md paths
  config.yaml                        # global defaults (model, paths)

  agents/
    trading-price-action/            # one directory per agent
      SOUL.md                        # agent identity + mission
      config.yaml                    # sources, schedule, model, mode
      state.json                     # processed video IDs, last check timestamps
      INBOX.md                       # new, not-yet-consolidated entries
      knowledge/
        _index.md                    # knowledge map + relevance overview
        concepts/                    # evergreen concept nodes (refined, not duplicated)
          support-resistance.md
          candlestick-patterns.md
        strategies/                  # specific, actionable strategies
          breakout-trading.md
        recent/                      # time-decayed entries by month
          2026-02/
            yt-abc123.md
      briefing.md                    # distilled output (auto-generated, human-readable)
      SKILL.md                       # Claude Code skill (auto-generated, injected into agents)
      sessions/
        2026-02-25.jsonl             # processing log for this day

    ai-developments/
      SOUL.md
      ...

cloracle/                            # source code repository
  core/
    scheduler.py                     # APScheduler heartbeat, per-agent schedules
    collector.py                     # YouTube channel check + content fetch
    analyzer.py                      # AI analysis, summarization, relevance scoring
    synthesizer.py                   # knowledge consolidation, briefing generation
    skill_writer.py                  # SKILL.md generation + registry update
    registry.py                      # manages ~/.cloracle/registry.json
    models/
      base.py                        # abstract Provider protocol
      gemini.py                      # Gemini (native YouTube URL support)
      openai.py                      # fallback (transcript-based)
      claude.py                      # fallback (transcript-based)
  main.py                            # entry point, loads all agents
  requirements.txt
```

---

## Agent Configuration Files

### SOUL.md

Defines the agent's identity, mission, and knowledge priorities. Human-readable. Not machine-parsed.

```markdown
# Trading Price Action Knowledge Agent

## Mission
I accumulate and maintain deep knowledge about price action-based trading strategies.
My primary goal is to build a structured knowledge base that can be consumed by
trading bot implementation agents.

## Domain
Trading, Technical Analysis, Price Action, Chart Patterns, Risk Management

## Output Goal
- Type: implementation-support
- Target: Algorithmic trading bot
- Key focus: Actionable strategies, entry/exit rules, risk parameters

## Mode
accumulate

## Knowledge Priorities
1. Price action patterns (Candlesticks, Support/Resistance)
2. Entry/Exit rules with concrete parameters
3. Risk Management frameworks
4. Backtesting methodologies
```

### config.yaml (per agent)

```yaml
agent_id: trading-price-action
mode: accumulate          # accumulate | watch
model: gemini             # gemini | openai | claude
analysis_mode: full_video # full_video | transcript_only

sources:
  youtube_channels:
    - handle: "@SMBCapital"
      check_schedule: "0 8 * * *"     # daily at 08:00
    - handle: "@TradingWithRayner"
      check_schedule: "0 9 * * *"

consolidation_schedule: "0 3 * * 0"   # weekly, Sunday 03:00

decay:
  half_life_days: 365     # accumulate mode: slow decay
  # half_life_days: 30    # watch mode: fast decay
```

### state.json (managed by the agent)

```json
{
  "last_checked": {
    "@SMBCapital": "2026-02-25T08:00:00Z"
  },
  "processed_video_ids": ["yt-abc123", "yt-def456"],
  "last_consolidation": "2026-02-23T03:00:00Z"
}
```

---

## Two-Loop Architecture

### Loop 1: Heartbeat / Collection (runs per channel schedule)

```
1. For each configured YouTube channel:
   a. Fetch channel feed, compare against state.json processed_video_ids
   b. For each new video:
      - If model == gemini AND analysis_mode == full_video:
          Pass YouTube URL directly to Gemini
      - Else:
          Download transcript via youtube-transcript-api
          Pass transcript to configured model
   c. AI prompt: "Extract key insights relevant to this agent's domain.
      Score relevance 0.0-1.0. Identify if this is a new concept or
      reinforces an existing one."
   d. Append structured result to INBOX.md
   e. Log to sessions/YYYY-MM-DD.jsonl
   f. Update state.json (add video ID to processed list)
```

### Loop 2: Consolidation (runs weekly)

```
1. Read all items from INBOX.md
2. Read knowledge/_index.md to understand existing concept landscape
3. For each INBOX item:
   a. AI decides: does this update an existing concept node or create a new one?
   b. If update: merge new information into existing concept file, update frontmatter
   c. If new: create new file in concepts/ or strategies/ or recent/YYYY-MM/
4. Recalculate effective weights for all knowledge files:
   effective_weight = relevance_score * exp(-ln2 * age_days / half_life_days)
5. Regenerate knowledge/_index.md (sorted by effective_weight)
6. Regenerate briefing.md (top-N concepts + recent highlights, human-readable)
7. Regenerate SKILL.md (machine-optimized for agent injection)
8. Update ~/.cloracle/registry.json with new SKILL.md path
9. Clear INBOX.md (archive to sessions/)
```

---

## Knowledge File Format

All files in `knowledge/` use YAML frontmatter for machine processing:

```markdown
---
created: 2025-01-15
updated: 2026-02-25
relevance_score: 0.87
decay_half_life: 365
effective_weight: 0.84    # recalculated during consolidation
sources:
  - yt-abc123
  - yt-def456
tags:
  - price-action
  - support-resistance
---

# Support and Resistance Levels

[human-readable content synthesized from multiple sources]
```

---

## Operating Modes

### `mode: accumulate` (e.g., Trading)

- Long decay half-life (365 days) — concepts remain stable
- AI merges new insights into existing concept nodes
- `briefing.md` structured as: Core Concepts → Strategies → Implementation Guidance
- `SKILL.md` optimized for injection into implementation agents
- Weekly consolidation creates a coherent knowledge graph over time

### `mode: watch` (e.g., AI Developments)

- Short decay half-life (30 days) — recent news dominates
- AI creates new `recent/YYYY-MM/` entries (less merging, more appending)
- `briefing.md` structured as: Recent Developments → Trends → Opportunity Suggestions
- Agent can generate proactive suggestions (new project ideas, business opportunities)
- `SKILL.md` includes a "Current State of the Art" section

---

## SKILL.md Format (auto-generated)

The generated skill is compatible with the Claude Code skill system and can be invoked with the `Skill` tool:

```markdown
---
name: trading-knowledge
description: Inject deep trading and price action knowledge. Use when implementing
  trading strategies, building trading bots, or needing expert context on price
  action and technical analysis.
last_updated: 2026-02-25
sources_processed: 47
---

# Trading Knowledge Context

## Core Concepts
[top-N concepts sorted by effective_weight, synthesized]

## Key Strategies
[actionable strategies with entry/exit rules]

## Recent Developments (last 30 days)
[recent highlights from recent/ directory]

## Implementation Guidance
[distilled key points for building a trading bot]
```

---

## Model Provider Abstraction

All models implement the same protocol (`base.py`):

```python
class KnowledgeProvider(Protocol):
    def analyze_video(self, video_url: str, soul: str, prompt: str) -> AnalysisResult: ...
    def analyze_transcript(self, transcript: str, soul: str, prompt: str) -> AnalysisResult: ...
    def consolidate(self, inbox_items: list, existing_index: str, soul: str) -> ConsolidationResult: ...
    def generate_briefing(self, knowledge_files: list, soul: str, mode: str) -> str: ...
```

- **Gemini**: uses `genai.upload_file()` with YouTube URL for `analyze_video()`, falls back to transcript for others
- **OpenAI / Claude**: `analyze_video()` automatically falls back to `analyze_transcript()`

Switching models requires only changing `model:` in the agent's `config.yaml`.

---

## Technology Stack

| Component | Library |
|-----------|---------|
| Scheduling | `APScheduler` |
| YouTube metadata | `yt-dlp` |
| Transcript extraction | `youtube-transcript-api` |
| Gemini API | `google-generativeai` |
| OpenAI API | `openai` |
| Claude API | `anthropic` |
| Config parsing | `PyYAML` |
| Frontmatter parsing | `python-frontmatter` |

---

## INBOX.md Format

```markdown
## 2026-02-25T08:42:00Z | @SMBCapital | yt-abc123
**Title:** How I Trade Support and Resistance Like a Pro
**Relevance Score:** 0.91
**Analysis Mode:** full_video

### Key Insights
- [bullet point 1]
- [bullet point 2]

### Suggested Action
update_concept: support-resistance
```

---

## Skill Registration Flow

After each consolidation:

1. `skill_writer.py` writes `SKILL.md` to the agent's workspace directory
2. Copies (or symlinks) to `~/.claude/plugins/cache/cloracle/<agent-id>/SKILL.md`
3. Updates `~/.cloracle/registry.json`:
   ```json
   {
     "agents": {
       "trading-price-action": {
         "skill_path": "~/.claude/plugins/cache/cloracle/trading-price-action/SKILL.md",
         "last_updated": "2026-02-25T03:00:00Z",
         "mode": "accumulate"
       }
     }
   }
   ```

---

## Example Agent Scenarios

### Scenario 1: Trading Bot Knowledge Base
```yaml
agent_id: trading-price-action
mode: accumulate
sources:
  youtube_channels:
    - handle: "@SMBCapital"
    - handle: "@TradingWithRayner"
    - handle: "@TickmillTrader"
```
Output: Implementation agents building a trading bot can invoke `Skill("trading-knowledge")` to get deep, structured context about price action strategies.

### Scenario 2: AI Developments Watcher
```yaml
agent_id: ai-developments
mode: watch
sources:
  youtube_channels:
    - handle: "@YannicKilcher"
    - handle: "@AndrejKarpathy"
    - handle: "@AIExplained"
```
Output: Daily briefing on the latest AI developments. Weekly `SKILL.md` with current state-of-the-art + proactive project suggestions.

---

## Implementation Approach

- **Approach A (chosen):** Lightweight Python service with APScheduler
- Runs as a persistent background process (`python main.py`)
- Can be added to Windows Task Scheduler for auto-start on login
- No external infrastructure required beyond Python packages
