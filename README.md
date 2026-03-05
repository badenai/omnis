# Omnis

A self-hosted knowledge agent that watches YouTube channels, extracts what matters to you, and keeps your Claude Code sessions informed about it.

Omnis runs scheduled collection jobs against channels you configure, analyzes transcripts with Gemini, and consolidates insights into organized knowledge files. It generates a `SKILL.md` that Claude Code picks up automatically — so your AI assistant stays current on whatever you're tracking.

---

## How it works

1. **Collection** (daily) — fetches new videos from your channels, sends transcripts to Gemini, extracts insights based on your agent's `SOUL.md` personality, appends to `INBOX.md`
2. **Consolidation** (weekly) — reads the inbox, organizes insights into `knowledge/` files, generates `digest.md` and `SKILL.md`
3. **SKILL.md** lands at `~/.claude/plugins/cache/omnis/<agent-id>/SKILL.md` — Claude Code picks it up automatically

---

## Requirements

- Python 3.11+
- Node.js 18+
- [`uv`](https://docs.astral.sh/uv/) (Python package manager)
- A [Gemini API key](https://aistudio.google.com/app/apikey)

---

## Setup

```bash
# Clone
git clone https://github.com/yourusername/omnis.git
cd omnis

# Configure
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# Install Python dependencies
uv sync

# Install frontend dependencies
cd web && npm install && cd ..
```

---

## Running locally

**Backend** (port 8420):
```bash
uv run python server.py
```

**Frontend** (port 5173, dev mode):
```bash
cd web && npm run dev
```

Open `http://localhost:5173` to access the UI.

---

## Creating your first agent

1. Open the UI and click **New Agent**
2. Give it a name, pick `accumulate` or `watch` mode, add a YouTube channel handle (e.g. `@3Blue1Brown`)
3. Write a `SOUL.md` — this is the most important step. Describe exactly what you want the agent to pay attention to and what to ignore
4. Save, then go to the **Status** tab and click **Trigger Collection** to run it manually
5. After collection, trigger **Consolidation** to generate your first digest and skill

---

## Modes

| | `accumulate` | `watch` |
|---|---|---|
| **Purpose** | Build deep expertise over time | Stay current on fast-moving topics |
| **Focus** | Timeless concepts, patterns, theory | Breaking news, trends, announcements |
| **Ideal half-life** | 365+ days | 14–90 days |

---

## File structure

All agent data is stored in `~/.omnis/agents/<agent-id>/`:

```
~/.omnis/agents/my-agent/
├── config.yaml       # settings
├── SOUL.md           # agent personality / what to focus on
├── state.json        # processed video IDs + timestamps
├── INBOX.md          # raw weekly insights (cleared after consolidation)
├── digest.md         # executive summary
├── SKILL.md          # Claude Code skill (auto-updated)
└── knowledge/
    ├── _index.md          # top 20 files by weight
    ├── concepts/          # timeless knowledge
    └── recent/YYYY-MM/    # time-sensitive findings
```

---

## Self-hosting

See [`deploy/`](deploy/) for:
- `omnis.service` — systemd unit file
- `nginx.conf` — nginx reverse proxy config
- `terraform/` — Terraform config for Proxmox LXC deployment

See [`NETWORKING.md`](NETWORKING.md) for a complete guide to deploying behind a reverse proxy with network segmentation.

---

## License

MIT — see [LICENSE](LICENSE)
