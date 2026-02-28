# Knowledge Hub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Omnis into a queryable knowledge hub where each agent is a streaming-capable expert accessible via chat UI, REST, and MCP.

**Architecture:** Phase 1 adds a query/chat layer on top of the existing pipeline (purely additive). Phase 2 adds an MCP server. Phase 3 removes the `mode` field and makes sources pluggable. Phase 4 adds micro-consolidation for `reflect_immediately` agents.

**Tech Stack:** FastAPI (SSE via StreamingResponse), google-genai streaming, React (SSE via EventSource), mcp (fastmcp), existing pipeline unchanged.

---

## Phase 1 — Query + Chat

### Task 1: Rename briefing.md → memory.md

**Files:**
- Modify: `core/consolidation.py:57-59, 112-116, 155-158`
- Modify: `api/routers/knowledge.py:63-69`
- Modify: `tests/` — grep for `briefing`

**Step 1: Write the failing test**

In `tests/test_memory_rename.py`:
```python
import pathlib
import pytest

def test_consolidation_writes_memory_md(tmp_path, mocker):
    """Consolidation must write memory.md, not briefing.md."""
    from core.consolidation import ConsolidationPipeline
    from core.models.types import AgentConfig

    config = AgentConfig(
        agent_id="test", mode="accumulate", model="gemini",
        analysis_mode="transcript_only", sources={},
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365},
    )
    provider = mocker.MagicMock()
    provider.consolidate.return_value = mocker.MagicMock(decisions=[])
    provider.generate_briefing.return_value = "# Memory\nTest content."
    provider.generate_skill.return_value = "# Skill"
    provider.validate_thesis.side_effect = Exception("skip")

    inbox_path = tmp_path / "INBOX.md"
    inbox_path.write_text("---\n## Item 1\ncontent\n", encoding="utf-8")
    (tmp_path / "knowledge").mkdir()

    pipeline = ConsolidationPipeline(tmp_path, config, provider, soul="Be an expert.")
    mocker.patch("core.consolidation.Registry")
    mocker.patch("core.consolidation.AgentState")
    pipeline.run()

    assert (tmp_path / "memory.md").exists(), "memory.md must be written"
    assert not (tmp_path / "briefing.md").exists(), "briefing.md must not be written"
```

**Step 2: Run to verify it fails**

```bash
uv run pytest tests/test_memory_rename.py -v
```
Expected: FAIL — `memory.md` not found.

**Step 3: Update consolidation.py**

In `core/consolidation.py`, replace every occurrence of `"briefing.md"` with `"memory.md"`:
- Line 59: `(self._dir / "briefing.md").write_text(...)` → `(self._dir / "memory.md").write_text(...)`
- Line 115: same
- Line 156-158: `briefing_path = self._dir / "briefing.md"` → `memory_path = self._dir / "memory.md"` (rename variable throughout `run_thesis_validation`)

**Step 4: Update knowledge router**

In `api/routers/knowledge.py`, rename the endpoint:
```python
@router.get("/{agent_id}/memory")
def read_memory(agent_id: str, request: Request):
    agent = _get_agent(agent_id, request)
    memory_path = agent["dir"] / "memory.md"
    # backward compat: fall back to old briefing.md
    if not memory_path.exists():
        memory_path = agent["dir"] / "briefing.md"
    if not memory_path.exists():
        raise HTTPException(404, "memory.md not found")
    return {"content": memory_path.read_text(encoding="utf-8")}
```
Remove the old `read_briefing` function.

**Step 5: Run test to verify it passes**

```bash
uv run pytest tests/test_memory_rename.py -v
```
Expected: PASS

**Step 6: Run full test suite**

```bash
uv run pytest -v
```
Expected: all previously passing tests still pass.

**Step 7: Commit**

```bash
git add core/consolidation.py api/routers/knowledge.py tests/test_memory_rename.py
git commit -m "feat: rename briefing.md to memory.md, add /memory endpoint with backward compat"
```

---

### Task 2: Add QueryHandler (core query logic)

**Files:**
- Create: `core/query.py`
- Test: `tests/test_query.py`

**Step 1: Write the failing test**

```python
# tests/test_query.py
import pathlib
import pytest

def test_select_tier_default():
    from core.query import QueryHandler
    qh = QueryHandler.__new__(QueryHandler)
    assert qh.select_tier("What do you know about price action?") == 1

def test_select_tier_recent_keywords():
    from core.query import QueryHandler
    qh = QueryHandler.__new__(QueryHandler)
    assert qh.select_tier("What are the latest trends this week?") == 2
    assert qh.select_tier("What happened recently in AI?") == 2

def test_build_context_tier1_returns_soul_and_memory(tmp_path):
    from core.query import QueryHandler
    soul = "I am an expert."
    (tmp_path / "memory.md").write_text("# Memory\nKey insight here.", encoding="utf-8")
    qh = QueryHandler(agent_dir=tmp_path, soul=soul)
    context, sources = qh.build_context(tier=1)
    assert "Key insight here." in context
    assert sources == ["memory.md"]

def test_build_context_tier1_falls_back_if_no_memory(tmp_path):
    from core.query import QueryHandler
    qh = QueryHandler(agent_dir=tmp_path, soul="Expert.")
    context, sources = qh.build_context(tier=1)
    assert context == ""
    assert sources == []
```

**Step 2: Run to verify fails**

```bash
uv run pytest tests/test_query.py -v
```
Expected: FAIL — `core.query` not found.

**Step 3: Implement core/query.py**

```python
# core/query.py
import pathlib
from datetime import datetime, timezone, timedelta

import frontmatter

_RECENT_KEYWORDS = {"latest", "recent", "trend", "today", "this week", "current", "new", "now"}
_DEEP_KEYWORDS = {"explain", "deep dive", "detail", "how does", "what is", "define"}


class QueryHandler:
    def __init__(self, agent_dir: pathlib.Path, soul: str):
        self._dir = agent_dir
        self._soul = soul

    def select_tier(self, question: str) -> int:
        q = question.lower()
        if any(kw in q for kw in _RECENT_KEYWORDS):
            return 2
        return 1

    def build_context(self, tier: int) -> tuple[str, list[str]]:
        """Returns (context_text, list_of_source_paths)."""
        parts: list[str] = []
        sources: list[str] = []

        memory_path = self._dir / "memory.md"
        if not memory_path.exists():
            memory_path = self._dir / "briefing.md"  # backward compat

        if memory_path.exists():
            parts.append(memory_path.read_text(encoding="utf-8"))
            sources.append(memory_path.name)

        if tier >= 2:
            # Add recent knowledge files (last 30 days)
            recent_dir = self._dir / "knowledge" / "recent"
            cutoff = datetime.now(timezone.utc).date() - timedelta(days=30)
            if recent_dir.exists():
                for md in sorted(recent_dir.rglob("*.md"), reverse=True)[:20]:
                    try:
                        post = frontmatter.load(str(md))
                        created_str = post.get("created", "")
                        if created_str:
                            from datetime import date
                            created = date.fromisoformat(str(created_str))
                            if created >= cutoff:
                                rel = str(md.relative_to(self._dir))
                                parts.append(f"### {md.stem}\n{post.content}")
                                sources.append(rel)
                    except Exception:
                        pass

        return "\n\n".join(parts), sources

    def build_system_prompt(self, context: str) -> str:
        return (
            f"You are a knowledge expert. Your identity and focus:\n\n{self._soul}\n\n"
            "Answer based on your accumulated knowledge below. "
            "When you reference specific knowledge, mention the source file name. "
            "If asked about recent trends, emphasize newer findings. "
            "If your knowledge doesn't cover something, say so honestly.\n\n"
            f"## Your Knowledge\n\n{context}"
            if context else
            f"You are a knowledge expert. Your identity and focus:\n\n{self._soul}\n\n"
            "Your knowledge base is currently empty. Tell the user to run collection first."
        )
```

**Step 4: Run tests**

```bash
uv run pytest tests/test_query.py -v
```
Expected: PASS

**Step 5: Commit**

```bash
git add core/query.py tests/test_query.py
git commit -m "feat: add QueryHandler with tiered context loading"
```

---

### Task 3: Add streaming query endpoint

**Files:**
- Modify: `core/models/gemini.py` — add `stream_query` method
- Modify: `core/models/base.py` — add abstract `stream_query`
- Create: `api/routers/query.py`
- Modify: `api/app.py` — register new router
- Test: `tests/test_query_endpoint.py`

**Step 1: Add stream_query to the provider interface**

In `core/models/base.py`, find the base class (or add abstract method if it's a plain class).
Add:
```python
def stream_query(self, system_prompt: str, message: str, history: list[dict]):
    """Yields text tokens. history items: {"role": "user"|"model", "content": str}"""
    raise NotImplementedError
```

**Step 2: Implement stream_query in GeminiProvider**

In `core/models/gemini.py`, add after existing methods:
```python
def stream_query(self, system_prompt: str, message: str, history: list[dict]):
    """Yields string tokens from a streaming Gemini chat."""
    from google.genai import types as gtypes

    contents = []
    for h in history:
        role = "user" if h["role"] == "user" else "model"
        contents.append(gtypes.Content(role=role, parts=[gtypes.Part(text=h["content"])]))
    contents.append(gtypes.Content(role="user", parts=[gtypes.Part(text=message)]))

    response = self._client.models.generate_content_stream(
        model=self._consolidation_model,
        contents=contents,
        config=gtypes.GenerateContentConfig(system_instruction=system_prompt),
    )
    for chunk in response:
        if chunk.text:
            yield chunk.text
```

**Step 3: Write the failing test**

```python
# tests/test_query_endpoint.py
import pytest
from fastapi.testclient import TestClient

def _make_app(mocker, agent_dir, soul="Expert."):
    from api.app import create_app
    app = create_app()
    from core.models.types import AgentConfig
    config = AgentConfig(
        agent_id="test-agent", mode="accumulate", model="gemini",
        analysis_mode="transcript_only", sources={},
        consolidation_schedule="0 3 * * 0", decay={"half_life_days": 365},
    )
    provider = mocker.MagicMock()
    provider.stream_query.return_value = iter(["Hello", " world"])
    app.state.agents = {
        "test-agent": {"config": config, "dir": agent_dir, "soul": soul, "provider": provider}
    }
    return app, provider

def test_query_endpoint_streams(tmp_path, mocker):
    app, provider = _make_app(mocker, tmp_path)
    (tmp_path / "memory.md").write_text("# Memory\nTest.", encoding="utf-8")
    client = TestClient(app, raise_server_exceptions=True)
    with client.stream("POST", "/api/query/test-agent", json={"message": "Hi", "history": []}) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        body = b"".join(r.iter_bytes()).decode()
        assert "Hello" in body
        assert "world" in body

def test_query_endpoint_404_for_unknown_agent(tmp_path, mocker):
    app, _ = _make_app(mocker, tmp_path)
    client = TestClient(app)
    r = client.post("/api/query/no-such-agent", json={"message": "Hi", "history": []})
    assert r.status_code == 404
```

**Step 4: Run to verify fails**

```bash
uv run pytest tests/test_query_endpoint.py -v
```
Expected: FAIL — `/api/query/` not found.

**Step 5: Create api/routers/query.py**

```python
# api/routers/query.py
import json
import logging
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.query import QueryHandler

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/query", tags=["query"])


class QueryRequest(BaseModel):
    message: str
    history: list[dict] = []


@router.post("/{agent_id}")
async def query_agent(agent_id: str, body: QueryRequest, request: Request):
    agents = request.app.state.agents
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    soul = agent.get("soul", "")
    provider = agent["provider"]

    qh = QueryHandler(agent_dir=agent["dir"], soul=soul)
    tier = qh.select_tier(body.message)
    context, sources = qh.build_context(tier=tier)
    system_prompt = qh.build_system_prompt(context)

    def event_stream():
        try:
            for token in provider.stream_query(system_prompt, body.message, body.history):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield f"data: {json.dumps({'sources': sources})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Query stream error for {agent_id}: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

**Step 6: Register router in api/app.py**

In `api/app.py`, add to the imports:
```python
from api.routers import agents, scheduler, knowledge, query
```
And after the existing `app.include_router(knowledge.router)`:
```python
app.include_router(query.router)
```

**Step 7: Also store soul and provider in app.state.agents**

In `api/app.py`, find the agent loading loop. Check `core/agent_loader.py` to see what it returns — the agent dict needs `soul` and `provider` keys. If they're not there yet, add them in `load_agent`.

Check `core/agent_loader.py`:
```bash
uv run python -c "from core.agent_loader import load_agent; help(load_agent)"
```
The `load_agent` function returns a dict. Verify it includes `soul` and `provider`. If not, add them.

**Step 8: Run tests**

```bash
uv run pytest tests/test_query_endpoint.py -v
```
Expected: PASS

**Step 9: Manual smoke test**

```bash
# Start the server
uv run uvicorn api.app:create_app --factory --port 8420 --reload

# In another terminal (replace "my-agent" with a real agent ID):
curl -N -X POST http://localhost:8420/api/query/my-agent \
  -H "Content-Type: application/json" \
  -d '{"message": "What do you know?", "history": []}'
```
Expected: SSE stream of tokens.

**Step 10: Commit**

```bash
git add core/models/gemini.py core/models/base.py api/routers/query.py api/app.py
git commit -m "feat: add streaming query endpoint POST /api/query/{agent_id}"
```

---

### Task 4: Chat UI — Chat/Manage toggle + ChatPanel

**Files:**
- Create: `web/src/components/ChatPanel.tsx`
- Create: `web/src/api/query.ts`
- Modify: `web/src/components/AgentDetail.tsx`

**Step 1: Add query API client**

Create `web/src/api/query.ts`:
```typescript
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
}

export async function* streamQuery(
  agentId: string,
  message: string,
  history: ChatMessage[]
): AsyncGenerator<{ token?: string; sources?: string[]; done?: boolean }> {
  const res = await fetch(`/api/query/${agentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history: history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', content: h.content })),
    }),
  });

  if (!res.ok) throw new Error(`Query failed: ${res.status}`);
  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6);
      if (raw === '[DONE]') { yield { done: true }; return; }
      try {
        yield JSON.parse(raw);
      } catch { /* skip malformed */ }
    }
  }
}
```

**Step 2: Create ChatPanel.tsx**

Create `web/src/components/ChatPanel.tsx`:
```tsx
import { useState, useRef, useEffect } from 'react';
import { streamQuery, type ChatMessage } from '../api/query';

export default function ChatPanel({ agentId }: { agentId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMsg]);
    let sources: string[] = [];

    try {
      for await (const chunk of streamQuery(agentId, userMsg.content, messages)) {
        if (chunk.token) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: updated[updated.length - 1].content + chunk.token,
            };
            return updated;
          });
        }
        if (chunk.sources) sources = chunk.sources;
      }
      if (sources.length > 0) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], sources };
          return updated;
        });
      }
    } catch (e) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], content: 'Error: ' + String(e) };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[500px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Ask this agent anything about its field of expertise.
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-100 border border-white/5'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Sources</p>
                  {msg.sources.map(s => (
                    <span key={s} className="inline-block text-[10px] bg-gray-700 text-gray-300 rounded px-1.5 py-0.5 mr-1 mb-1 font-mono">{s}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && messages[messages.length - 1]?.content === '' && (
          <div className="flex justify-start">
            <div className="bg-gray-800 border border-white/5 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: `${i*0.15}s`}} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/5">
        <div className="flex gap-3">
          <input
            className="flex-1 bg-gray-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50"
            placeholder="Ask your expert..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Update AgentDetail.tsx — add Chat/Manage toggle**

In `web/src/components/AgentDetail.tsx`:
1. Add import: `import ChatPanel from './ChatPanel';`
2. Add state: `const [viewMode, setViewMode] = useState<'chat' | 'manage'>('chat');`
3. In the header section, after the agent name, add the toggle pill:
```tsx
<div className="flex bg-gray-800 rounded-xl p-1 gap-1">
  {(['chat', 'manage'] as const).map(mode => (
    <button
      key={mode}
      onClick={() => setViewMode(mode)}
      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
        viewMode === mode
          ? 'bg-indigo-600 text-white shadow'
          : 'text-gray-400 hover:text-white'
      }`}
    >
      {mode}
    </button>
  ))}
</div>
```
4. Wrap the existing dashboard grid with `{viewMode === 'manage' && (...)}` and add:
```tsx
{viewMode === 'chat' && (
  <div className="bg-gray-900/60 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden">
    <ChatPanel agentId={agent.agent_id} />
  </div>
)}
```

**Step 4: Start dev and test manually**

```bash
# In project root:
.\Start-Dev.ps1
```
Navigate to `http://localhost:5173`, open an agent, verify:
- Chat/Manage toggle appears in header
- Chat tab shows empty state message
- Sending a message streams a response token by token
- Sources appear after the response

**Step 5: Commit**

```bash
git add web/src/components/ChatPanel.tsx web/src/api/query.ts web/src/components/AgentDetail.tsx
git commit -m "feat: add chat panel with streaming and Chat/Manage toggle in agent detail"
```

---

### Task 5: Update Memory view in KnowledgeBrowser

**Files:**
- Modify: `web/src/components/KnowledgeBrowser.tsx`
- Modify: `web/src/api/` — add memory fetch

**Step 1: Add memory API call**

In `web/src/api/agents.ts` (or wherever knowledge API calls live), add:
```typescript
export function useAgentMemory(agentId: string) {
  return useQuery({
    queryKey: ['agent', agentId, 'memory'],
    queryFn: () => fetch(`/api/knowledge/${agentId}/memory`).then(r => r.json()),
    retry: false,
  });
}
```

**Step 2: Update KnowledgeBrowser to show memory.md with source links**

In `web/src/components/KnowledgeBrowser.tsx`:
- Add a "Memory" tab/button alongside existing file browser
- When selected, show the memory.md content rendered as markdown
- Parse `[source](../path.md)` links and make them clickable (opens knowledge file)

Use a lightweight markdown renderer if one is already in `package.json`. Check:
```bash
cd web && cat package.json | grep -E "marked|remark|react-markdown"
```
If none exists: render as `<pre>` with whitespace-pre-wrap for now (keep it simple).

**Step 3: Commit**

```bash
git add web/src/components/KnowledgeBrowser.tsx web/src/api/
git commit -m "feat: add Memory view in knowledge browser with source links"
```

---

## Phase 2 — MCP Server

### Task 6: MCP Server

**Files:**
- Create: `core/mcp_server.py`
- Create: `main_mcp.py`
- Modify: `pyproject.toml` — add mcp dependency

**Step 1: Add dependency**

```bash
uv add "mcp[cli]"
```

**Step 2: Write the failing test**

```python
# tests/test_mcp_server.py
def test_mcp_server_module_imports():
    """MCP server module must import without errors."""
    import core.mcp_server  # noqa: F401

def test_list_agents_tool_exists():
    from core.mcp_server import build_mcp_server
    agents = {
        "test": {
            "config": type("C", (), {"agent_id": "test"})(),
            "dir": __import__("pathlib").Path("/tmp"),
            "soul": "I am an expert.",
        }
    }
    server = build_mcp_server(agents)
    tool_names = [t.name for t in server.list_tools()]
    assert "list_agents" in tool_names
    assert "ask_test" in tool_names
```

**Step 3: Run to verify fails**

```bash
uv run pytest tests/test_mcp_server.py -v
```

**Step 4: Implement core/mcp_server.py**

```python
# core/mcp_server.py
import pathlib
from mcp.server.fastmcp import FastMCP
from core.query import QueryHandler


def build_mcp_server(agents: dict) -> FastMCP:
    mcp = FastMCP("omnis")

    @mcp.tool()
    def list_agents() -> list[dict]:
        """List all available knowledge agents."""
        result = []
        for agent_id, agent in agents.items():
            soul_lines = agent.get("soul", "").strip().splitlines()
            description = soul_lines[0] if soul_lines else "No description."
            kw = None
            try:
                from core.knowledge import KnowledgeWriter
                config = agent["config"]
                kw = KnowledgeWriter(agent["dir"], config.decay.get("half_life_days", 365))
                count = len(kw.load_all_weighted())
            except Exception:
                count = 0
            result.append({
                "id": agent_id,
                "description": description,
                "knowledge_count": count,
            })
        return result

    for agent_id, agent in agents.items():
        soul = agent.get("soul", "")
        agent_dir = agent["dir"]
        provider = agent.get("provider")
        soul_lines = soul.strip().splitlines()
        tool_description = soul_lines[0] if soul_lines else f"Ask the {agent_id} expert."

        def _make_ask_tool(aid: str, adir: pathlib.Path, s: str, p):
            @mcp.tool(name=f"ask_{aid}", description=tool_description)
            def ask_agent(query: str) -> str:
                """Ask this knowledge agent a question."""
                qh = QueryHandler(agent_dir=adir, soul=s)
                tier = qh.select_tier(query)
                context, _ = qh.build_context(tier=tier)
                system_prompt = qh.build_system_prompt(context)
                tokens = list(p.stream_query(system_prompt, query, []))
                return "".join(tokens)
            return ask_agent

        _make_ask_tool(agent_id, agent_dir, soul, provider)

    return mcp


if __name__ == "__main__":
    from core.agent_loader import load_agent
    from core.constants import DATA_DIR
    import os

    AGENTS_DIR = DATA_DIR / "agents"
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
    loaded = {}
    for agent_dir in sorted(AGENTS_DIR.iterdir()):
        if not agent_dir.is_dir() or not (agent_dir / "config.yaml").exists():
            continue
        try:
            loaded[agent_dir.name] = load_agent(agent_dir, gemini_api_key=gemini_api_key)
        except Exception as e:
            print(f"Failed to load {agent_dir.name}: {e}")

    server = build_mcp_server(loaded)
    server.run()
```

**Step 5: Create main_mcp.py**

```python
# main_mcp.py
from core.mcp_server import __main__  # noqa
```
Actually just run via: `uv run python -m core.mcp_server`

**Step 6: Run tests**

```bash
uv run pytest tests/test_mcp_server.py -v
```
Expected: PASS

**Step 7: Test manually**

```bash
uv run python -m core.mcp_server
```
Expected: MCP server starts, lists tools.

**Step 8: Add MCP config to README**

Add to `DOCS.md` under a new "MCP Integration" section:
```markdown
## MCP Integration

Add to Claude Desktop / Claude Code `settings.json`:
```json
{
  "mcpServers": {
    "omnis": {
      "command": "uv",
      "args": ["run", "python", "-m", "core.mcp_server"],
      "cwd": "/absolute/path/to/omnis"
    }
  }
}
```
All agents become available as `ask_<agent_id>` tools automatically.
```

**Step 9: Commit**

```bash
git add core/mcp_server.py pyproject.toml uv.lock DOCS.md tests/test_mcp_server.py
git commit -m "feat: add MCP server exposing each agent as ask_{id} tool"
```

---

## Phase 3 — Mode Unification + Pluggable Sources

### Task 7: Remove mode field

**Files:**
- Modify: `core/models/types.py`
- Modify: `core/consolidation.py`
- Modify: `api/routers/agents.py`
- Modify: `api/schemas.py`
- Modify: `web/src/types/index.ts`
- Modify: `web/src/components/AgentDetail.tsx` — remove mode badge
- Modify: `web/src/components/AgentList.tsx` — remove mode badge
- Test: update any tests that set `mode`

**Step 1: Search all mode references**

```bash
grep -rn '"mode"\|\.mode\b\|mode=' --include="*.py" --include="*.ts" --include="*.tsx" .
```

**Step 2: Make mode optional in AgentConfig**

In `core/models/types.py`:
```python
@dataclass
class AgentConfig:
    agent_id: str
    model: str
    analysis_mode: str
    sources: dict
    consolidation_schedule: str
    decay: dict
    collection_model: str = "gemini-3-flash-preview"
    consolidation_model: str = "gemini-3.1-pro-preview"
    research: dict = field(default_factory=dict)
    reflect_immediately: bool = False
    mode: str = ""   # kept for backward compat loading old configs; unused
```

**Step 3: Remove mode-gating from consolidation**

In `core/consolidation.py`:
- `_call_thesis_validation_safely`: remove the `if self._config.mode != "accumulate": return` guard — always run thesis validation
- `generate_briefing` call: remove `self._config.mode` argument (update provider method signature too)

**Step 4: Update generate_briefing in gemini.py**

Find `generate_briefing` in `core/models/gemini.py`. Remove the `mode` parameter. The briefing prompt should no longer vary by mode — use a single unified structure:
```
## Core Knowledge (by weight)
## Recent Developments (last 30 days)
## Open Questions / Counter-Evidence
```

**Step 5: Remove mode from API schemas and UI**

In `api/schemas.py`: make `mode` optional with default `""`.
In `web/src/types/index.ts`: remove `mode` from `AgentSummary` and `AgentDetail`, or make optional.
In `web/src/components/AgentList.tsx`: delete the mode badge span.
In `web/src/components/AgentDetail.tsx`: delete the mode badge span.

**Step 6: Run full test suite**

```bash
uv run pytest -v
```
Fix any failures.

**Step 7: Commit**

```bash
git add .
git commit -m "feat: remove mode field — agents are unified experts, mode no longer needed"
```

---

### Task 8: Add reflect_immediately config + SourcePlugin interface

**Files:**
- Modify: `core/models/types.py` — `reflect_immediately` already added in Task 7
- Create: `core/sources/__init__.py`
- Create: `core/sources/base.py`
- Create: `core/sources/youtube.py` — extract from existing collector
- Modify: `api/routers/agents.py` — update source parsing
- Modify: `web/src/components/` — update source config UI

**Step 1: Create SourcePlugin interface**

```python
# core/sources/base.py
from dataclasses import dataclass
from typing import Protocol


@dataclass
class SourceItem:
    content: str           # transcript or text content
    source_id: str         # unique ID (video ID, URL hash, etc.)
    title: str
    source_url: str | None = None


class SourcePlugin(Protocol):
    source_type: str

    async def fetch(self, config: dict) -> list[SourceItem]:
        ...
```

**Step 2: Commit**

```bash
git add core/sources/
git commit -m "feat: add SourcePlugin interface for pluggable source types"
```

---

## Phase 4 — Micro-Consolidation

### Task 9: Micro-consolidation pipeline

**Files:**
- Create: `core/micro_consolidation.py`
- Modify: `core/pipeline.py` — call micro-consolidation when `reflect_immediately=True`
- Test: `tests/test_micro_consolidation.py`

**Step 1: Write the failing test**

```python
# tests/test_micro_consolidation.py
def test_micro_consolidation_updates_knowledge(tmp_path, mocker):
    from core.micro_consolidation import MicroConsolidation
    from core.models.types import AgentConfig

    config = AgentConfig(
        agent_id="test", model="gemini", analysis_mode="transcript_only",
        sources={}, consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365}, reflect_immediately=True,
    )
    provider = mocker.MagicMock()
    provider.consolidate.return_value = mocker.MagicMock(
        decisions=[mocker.MagicMock(inbox_index=0, action="new_concept", target="test-concept")]
    )
    provider.generate_briefing.return_value = "# Memory\nContent."
    provider.generate_skill.return_value = "# Skill"
    provider.validate_thesis.side_effect = Exception("skip")

    mc = MicroConsolidation(tmp_path, config, provider, soul="Expert.")
    mocker.patch("core.micro_consolidation.Registry")
    mocker.patch("core.micro_consolidation.AgentState")
    mc.run(item="New insight about trading.")

    concept_path = tmp_path / "knowledge" / "concepts" / "test-concept.md"
    assert concept_path.exists()
    assert (tmp_path / "memory.md").exists()
```

**Step 2: Implement core/micro_consolidation.py**

```python
# core/micro_consolidation.py
import pathlib
import logging
from core.constants import DATA_DIR
from core.knowledge import KnowledgeWriter
from core.registry import Registry
from core.skill_writer import SkillWriter
from core.state import AgentState
from core.models.types import AgentConfig

logger = logging.getLogger(__name__)


class MicroConsolidation:
    """Single-item immediate consolidation for reflect_immediately agents."""

    def __init__(self, agent_dir: pathlib.Path, config: AgentConfig, provider, soul: str):
        self._dir = agent_dir
        self._config = config
        self._provider = provider
        self._soul = soul

    def run(self, item: str) -> None:
        agent_id = self._config.agent_id
        logger.info(f"[{agent_id}] Micro-consolidation triggered.")

        index_path = self._dir / "knowledge" / "_index.md"
        existing_index = index_path.read_text(encoding="utf-8") if index_path.exists() else ""

        result = self._provider.consolidate([item], existing_index, self._soul)

        kw = KnowledgeWriter(self._dir, self._config.decay.get("half_life_days", 365))
        for decision in result.decisions:
            if decision.action == "update_concept":
                kw.update_concept(decision.target, item, source_id="micro")
            elif decision.action == "new_concept":
                kw.write_concept(decision.target, item)
            elif decision.action == "new_recent":
                kw.write_recent(decision.target, item, source_id="micro")

        knowledge_files = kw.load_all_weighted()
        memory = self._provider.generate_briefing(knowledge_files, self._soul)
        (self._dir / "memory.md").write_text(memory, encoding="utf-8")

        skill_content = self._provider.generate_skill(memory, self._soul, agent_id)
        sw = SkillWriter(self._dir)
        sw.write(skill_content, agent_id)

        reg = Registry(DATA_DIR / "registry.json")
        reg.register(agent_id, self._dir / "SKILL.md", "")
        reg.save()

        self._update_index(knowledge_files)

        state = AgentState(self._dir)
        state.update_last_consolidation()
        state.save()

    def _update_index(self, files: list[dict]) -> None:
        lines = ["# Knowledge Index\n"]
        for f in files[:20]:
            lines.append(f"- `{f['path']}` — weight: {f['effective_weight']:.3f}")
        index_path = self._dir / "knowledge" / "_index.md"
        index_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.write_text("\n".join(lines), encoding="utf-8")
```

**Step 3: Wire into collection pipeline**

In `core/pipeline.py`, after appending to INBOX.md, check `config.reflect_immediately`:
```python
if self._config.reflect_immediately:
    from core.micro_consolidation import MicroConsolidation
    mc = MicroConsolidation(self._dir, self._config, self._provider, self._soul)
    mc.run(insight_text)  # pass the collected insight
else:
    inbox.append(insight_text)
```

**Step 4: Run tests**

```bash
uv run pytest tests/test_micro_consolidation.py -v
uv run pytest -v  # full suite
```

**Step 5: Commit**

```bash
git add core/micro_consolidation.py core/pipeline.py tests/test_micro_consolidation.py
git commit -m "feat: add micro-consolidation for reflect_immediately agents"
```

---

## Running the Full Test Suite

After each phase:
```bash
uv run pytest -v --tb=short
```

## Dev Server

```bash
.\Start-Dev.ps1
```
Backend: http://localhost:8420
Frontend: http://localhost:5173
