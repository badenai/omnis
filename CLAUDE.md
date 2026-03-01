# Omnis — Documentation for Dummies

## What is Omnis?

Omnis is a **knowledge agent system** that automatically learns about topics you care about. Think of it as a personal research assistant that:

1. Watches YouTube channels for new videos
2. Reads and analyzes those videos to extract key insights
3. Stores what it learns in organized knowledge files
4. Consolidates that knowledge into a comprehensive digest document
5. Exports everything as a **SKILL.md file** you can inject into Claude Code

**In one sentence:** Omnis watches channels you care about, extracts what matters to you specifically, and keeps your Claude sessions informed about it.

---

## Core Concepts

### Agent
An agent is a dedicated research instance that watches specific YouTube channels. Each agent has its own personality, channels, knowledge base, and schedule.

Think of it like hiring a researcher and saying: "Watch these 3 tech channels and report back anything relevant to AI safety."

### SOUL.md
The agent's personality and mission statement. It tells the AI *what to pay attention to* and *what to ignore*. This is the most important thing to get right — it directly controls what gets learned.

Example:
```markdown
# AI Safety Research Agent

Focus on:
- Alignment techniques and theory
- Interpretability research
- Scaling laws and emergent behaviour

Ignore: speculation without evidence, hype without substance
```

### Collection
The daily job. For each YouTube channel, it:
1. Fetches the latest 10 videos (skipping ones already processed)
2. Downloads the transcript (or sends the video directly if `full_video` mode)
3. Sends transcript + SOUL to Gemini: "What's relevant here?"
4. Gets back: insights, a relevance score (0–1), and a suggested filing location
5. Appends everything to **INBOX.md**

### Inbox (INBOX.md)
A staging area for raw weekly insights — like an email inbox. Entries pile up during the week and get processed all at once during consolidation. After consolidation it's cleared.

### Knowledge Base
Organized markdown files in two folders:
- `knowledge/concepts/` — timeless knowledge (techniques, theory, fundamentals)
- `knowledge/recent/YYYY-MM/` — time-sensitive finds (news, papers, announcements)

### Consolidation
The weekly job that converts raw inbox items into organized knowledge. Steps:
1. Read all items in INBOX.md
2. Ask Gemini: "Should each item update an existing concept, create a new concept, or go in recent news?"
3. Write/update the knowledge files accordingly
4. Generate **digest.md** (a human-readable executive summary)
5. Generate **SKILL.md** (ready for Claude Code)
6. Clear INBOX.md (start fresh next week)

### Decay (Effective Weight)
Knowledge that isn't reinforced by new information slowly loses importance — like human memory. The system uses exponential decay:

```
effective_weight = relevance_score × exp(-ln(2) × age_days / half_life_days)
```

Concretely, with a half-life of 365 days:
- Day 0: weight = 0.9 × 1.0 = **0.9**
- Day 90: weight = 0.9 × 0.84 = **0.76**
- Day 365: weight = 0.9 × 0.5 = **0.45**
- Day 730: weight = 0.9 × 0.25 = **0.23**

Higher weight = appears higher in digests and SKILL.md. Old knowledge doesn't disappear — it just becomes less prominent.

### digest.md
An AI-generated executive summary of all weighted knowledge, structured by mode:
- **accumulate:** Core Concepts → Strategies → Implementation Guidance
- **watch:** Recent Developments → Trends → Opportunity Suggestions

### SKILL.md
A Claude Code skill file — condensed, actionable knowledge from the digest, formatted so Claude can use it as context. Written to two places:
- `~/.omnis/agents/<id>/SKILL.md` (your copy)
- `~/.claude/plugins/cache/omnis/<id>/SKILL.md` (Claude Code picks this up automatically)

---

## Two Modes: Accumulate vs. Watch

| | accumulate | watch |
|---|---|---|
| **Purpose** | Build deep expertise over time | Stay current on fast-moving topics |
| **Focus** | Timeless concepts, patterns, theory | Breaking news, trends, announcements |
| **digest.md** | Concepts → Strategies → Implementation | Developments → Trends → Opportunities |
| **Ideal half-life** | 365+ days | 14–90 days |
| **Use case** | "Learn price action trading deeply" | "Monitor AI releases and announcements" |

Everything else — collection, inbox, knowledge files — works identically in both modes. The mode only changes how Gemini structures the final digest and skill output, and you should set `half_life_days` to match.

---

## Full Pipeline End-to-End

```
COLLECTION (daily, e.g. 8 AM)
────────────────────────────────
YouTube channel
  → fetch latest 10 videos (skip already-seen ones)
  → download transcript
  → Gemini analyzes against SOUL.md
  → returns: insights, relevance score, suggested filing
  → append to INBOX.md
  → mark video as processed in state.json

(repeat for each channel, each day of the week)


CONSOLIDATION (weekly, e.g. Sunday 3 AM)
─────────────────────────────────────────
Read INBOX.md (all week's raw entries)
  → Gemini decides for each item:
      "update_concept" → merge into knowledge/concepts/filename.md
      "new_concept"    → create knowledge/concepts/filename.md
      "new_recent"     → create knowledge/recent/YYYY-MM/filename.md
  → generate digest.md from top weighted files
  → generate SKILL.md from digest
  → update knowledge/_index.md (top 20 by weight)
  → clear INBOX.md
  → save last_consolidation timestamp
```

---

## Config Options Explained

```yaml
agent_id: "my-agent"
```
Unique name. Also the directory name. Use lowercase with dashes.

```yaml
mode: "accumulate"   # or "watch"
```
How the agent prioritizes knowledge. See the table above.

```yaml
model: "gemini"
```
Which AI provider. Currently only `"gemini"` is fully implemented.

```yaml
analysis_mode: "transcript_only"   # or "full_video"
```
- `transcript_only` — Download transcript text, send to Gemini. Fast, cheap, works for most content.
- `full_video` — Send the actual YouTube URL to Gemini for native video understanding. Better for visual content (charts, demos), slower and more expensive. Only works with Gemini.

```yaml
sources:
  youtube_channels:
    - handle: "@ChannelHandle"
      check_schedule: "0 8 * * *"
```
- `handle` — The channel's `@username` (include the @).
- `check_schedule` — Cron expression: `minute hour day month weekday`
  - `"0 8 * * *"` = Every day at 8 AM
  - `"0 8 * * 1"` = Every Monday at 8 AM
  - `"0 */6 * * *"` = Every 6 hours

```yaml
consolidation_schedule: "0 3 * * 0"
```
When to run consolidation. `"0 3 * * 0"` = Sunday at 3 AM.

```yaml
decay:
  half_life_days: 365
```
Days until a knowledge file's weight drops to 50%.
- `365` — annual decay, good for accumulate mode
- `30–90` — monthly decay, good for watch mode
- `9999` — effectively permanent, for evergreen topics

```yaml
collection_model: "gemini-3-flash-preview"
consolidation_model: "gemini-3.1-pro-preview"
```
- `collection_model` — Used for transcript/video analysis. Called many times per run (once per video). Use a fast, cheap model.
- `consolidation_model` — Used for consolidation decisions, digest, and SKILL.md generation. Called rarely (3× per consolidation run). Use a smarter model for quality output.

---

## Managing Agents

### Via Web UI (http://localhost:5173 or :8420)
- **Dashboard** — table of all agents with status, inbox count, knowledge count
- **New Agent** button — form to create with all settings
- **Agent detail** — 4 tabs:
  - **Config** — edit all settings, save live
  - **Soul** — edit SOUL.md in place
  - **Status** — channel last-checked times, trigger buttons, scheduled jobs
  - **Knowledge** — browse knowledge files, search, read digest/SKILL.md
- **Sidebar activity panel** — live view of any running collection/consolidation with current step

### Via API
```bash
# List agents
curl http://localhost:8420/api/agents

# Trigger collection manually
curl -X POST http://localhost:8420/api/scheduler/trigger/my-agent/collect/%40ChannelHandle

# Trigger consolidation manually
curl -X POST http://localhost:8420/api/scheduler/trigger/my-agent/consolidate

# Check what's currently running
curl http://localhost:8420/api/scheduler/activity
```

### Manually (files)
Everything lives in `~/.omnis/agents/<id>/`. Edit config.yaml or SOUL.md directly, then restart the server for config changes to take effect.

---

## File Structure

```
~/.omnis/
├── agents/
│   └── my-agent/
│       ├── config.yaml        ← settings
│       ├── SOUL.md            ← personality
│       ├── state.json         ← processed video IDs + timestamps
│       ├── INBOX.md           ← raw inbox (cleared weekly)
│       ├── digest.md        ← weekly executive summary
│       ├── SKILL.md           ← Claude Code skill
│       └── knowledge/
│           ├── _index.md      ← top 20 files by weight
│           ├── concepts/
│           │   └── topic.md   ← timeless knowledge
│           └── recent/
│               └── 2026-02/
│                   └── news.md ← time-sensitive finds
└── registry.json              ← global index of all agents' SKILL.md paths
```

---

## How SKILL.md Works with Claude Code

After consolidation, SKILL.md lands at `~/.claude/plugins/cache/omnis/<agent-id>/SKILL.md`. Claude Code reads skills from this directory and can inject them as context into your conversations.

The skill contains condensed, actionable knowledge from your digest — whatever is most relevant based on effective weight. It's regenerated every consolidation cycle, so it stays current.

---

## Practical Tips

**SOUL.md is everything.** The quality of what gets collected is entirely driven by how well you describe what matters. Spend time on it. You can edit it anytime in the UI and the next collection run will use the new version.

**Start with one channel.** Get one agent working end-to-end before adding more channels or agents. Trigger collection and consolidation manually to see what comes out.

**Match half-life to content type.** Fast-moving spaces (AI news, crypto, markets) → short half-life (14–60 days). Deep technical knowledge (algorithms, architecture patterns) → long half-life (365+ days).

**Watch mode + daily consolidation = news feed.** If you set consolidation_schedule to daily and half_life_days to 14, you get a fresh, up-to-date digest every morning.

**The inbox is your draft pile.** If INBOX.md has lots of low-relevance entries (score < 0.3), your SOUL.md is probably too broad. Narrow it down to what you actually care about.
