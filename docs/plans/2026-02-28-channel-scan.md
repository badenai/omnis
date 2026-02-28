# Channel Scan Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a user pastes a YouTube channel URL into the Ingest Panel, fetch all videos, screen them against the agent's soul with one batch AI call, fully analyze only matches, and mark all fetched videos as processed.

**Architecture:** Two-step API — a synchronous preview endpoint returns video count and metadata, an async execute endpoint kicks off the background job. The frontend detects channel URLs automatically and shows an inline confirmation dialog when the channel has more than 50 videos.

**Tech Stack:** Python/FastAPI backend, `yt-dlp` for fetching, `google-genai` Gemini flash for batch screening, React/TanStack Query frontend.

---

### Task 1: Add channel URL detection and video fetching to `core/collector.py`

**Files:**
- Modify: `core/collector.py`
- Test: `tests/test_collector.py`

**Step 1: Write the failing tests**

Add to `tests/test_collector.py`:

```python
from core.collector import is_channel_url, get_channel_videos

def test_is_channel_url_handle():
    assert is_channel_url("https://www.youtube.com/@mkbhd") is True

def test_is_channel_url_c():
    assert is_channel_url("https://www.youtube.com/c/LinusTechTips") is True

def test_is_channel_url_channel_id():
    assert is_channel_url("https://www.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw") is True

def test_is_channel_url_user():
    assert is_channel_url("https://www.youtube.com/user/pewdiepie") is True

def test_is_channel_url_rejects_video():
    assert is_channel_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ") is False

def test_is_channel_url_rejects_youtu_be():
    assert is_channel_url("https://youtu.be/dQw4w9WgXcQ") is False

def test_get_channel_videos_returns_id_title_description(mocker):
    fake_entries = [
        {"id": "abc123", "title": "Video One", "description": "A cool video"},
        {"id": "def456", "title": "Video Two", "description": ""},
    ]
    mocker.patch("yt_dlp.YoutubeDL.__enter__", return_value=mocker.MagicMock(
        extract_info=mocker.MagicMock(return_value={"entries": fake_entries})
    ))
    mocker.patch("yt_dlp.YoutubeDL.__exit__", return_value=False)
    result = get_channel_videos("https://www.youtube.com/@test")
    assert len(result) == 2
    assert result[0] == {"id": "abc123", "title": "Video One", "description": "A cool video"}

def test_get_channel_videos_respects_limit(mocker):
    mock_ydl = mocker.MagicMock()
    mock_ydl.extract_info.return_value = {"entries": []}
    mocker.patch("yt_dlp.YoutubeDL", return_value=mocker.MagicMock(
        __enter__=mocker.MagicMock(return_value=mock_ydl),
        __exit__=mocker.MagicMock(return_value=False),
    ))
    get_channel_videos("https://www.youtube.com/@test", limit=25)
    opts_used = yt_dlp.YoutubeDL.call_args[0][0]
    assert opts_used["playlistend"] == 25
```

**Step 2: Run tests to verify they fail**

```
uv run pytest tests/test_collector.py::test_is_channel_url_handle tests/test_collector.py::test_get_channel_videos_returns_id_title_description -v
```

Expected: FAIL with `ImportError` or `AttributeError`

**Step 3: Implement in `core/collector.py`**

Add after the existing imports:

```python
import re

_CHANNEL_PATTERN = re.compile(
    r'youtube\.com/(@[\w.-]+|c/[\w.-]+|channel/UC[\w-]+|user/[\w.-]+)/?$'
)


def is_channel_url(url: str) -> bool:
    """Return True if url points to a YouTube channel (not a video)."""
    return bool(_CHANNEL_PATTERN.search(url))


def get_channel_videos(url: str, limit: int | None = None) -> list[dict]:
    """Fetch videos from a YouTube channel URL. Returns list of {id, title, description}."""
    opts: dict = {"quiet": True, "extract_flat": True}
    if limit is not None:
        opts["playlistend"] = limit
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    entries = info.get("entries", []) if info else []
    return [
        {
            "id": e.get("id", ""),
            "title": e.get("title", ""),
            "description": (e.get("description") or "")[:300],
        }
        for e in entries
        if e.get("id")
    ]
```

**Step 4: Run tests**

```
uv run pytest tests/test_collector.py -v
```

Expected: all collector tests PASS

**Step 5: Commit**

```bash
git add core/collector.py tests/test_collector.py
git commit -m "feat: add is_channel_url and get_channel_videos to collector"
```

---

### Task 2: Add batch video screening to `core/models/gemini.py`

**Files:**
- Modify: `core/models/gemini.py`
- Test: `tests/test_gemini_provider.py`

**Step 1: Write the failing test**

Add to `tests/test_gemini_provider.py`:

```python
def test_screen_videos_returns_relevant_ids(mocker):
    provider = GeminiProvider(api_key="fake")
    mocker.patch.object(provider, "_generate", return_value='{"relevant_ids": ["abc", "xyz"]}')
    videos = [
        {"id": "abc", "title": "Relevant Video", "description": ""},
        {"id": "def", "title": "Unrelated Video", "description": ""},
        {"id": "xyz", "title": "Also Relevant", "description": ""},
    ]
    result = provider.screen_videos(videos, soul="AI research")
    assert result == ["abc", "xyz"]

def test_screen_videos_empty_returns_empty(mocker):
    provider = GeminiProvider(api_key="fake")
    mocker.patch.object(provider, "_generate", return_value='{"relevant_ids": []}')
    result = provider.screen_videos([], soul="AI research")
    assert result == []
```

**Step 2: Run tests to verify they fail**

```
uv run pytest tests/test_gemini_provider.py::test_screen_videos_returns_relevant_ids -v
```

Expected: FAIL with `AttributeError: 'GeminiProvider' object has no attribute 'screen_videos'`

**Step 3: Add `screen_videos` to `GeminiProvider` in `core/models/gemini.py`**

Add this method inside `GeminiProvider` after `analyze_uploaded_file`:

```python
def screen_videos(self, videos: list[dict], soul: str) -> list[str]:
    """Batch-screen video titles/descriptions against soul. Returns list of relevant video IDs."""
    if not videos:
        return []
    videos_text = "\n\n".join(
        f"ID: {v['id']}\nTitle: {v['title']}\nDescription: {v['description'][:200]}"
        for v in videos
    )
    prompt = (
        f"AGENT SOUL:\n{soul}\n\n"
        f"VIDEOS TO SCREEN:\n{videos_text}\n\n"
        f"Which of these videos are relevant to the agent's soul and worth analyzing? "
        f"Respond with valid JSON only, no markdown fences:\n"
        f'{{\"relevant_ids\": [\"<id>\", ...]}}'
    )
    raw = self._generate(prompt)
    data = self._parse_result(raw)
    return data.get("relevant_ids", [])
```

**Step 4: Run tests**

```
uv run pytest tests/test_gemini_provider.py -v
```

Expected: all PASS

**Step 5: Commit**

```bash
git add core/models/gemini.py tests/test_gemini_provider.py
git commit -m "feat: add screen_videos batch screening to GeminiProvider"
```

---

### Task 3: Add `run_channel` to `ManualIngestionPipeline`

**Files:**
- Modify: `core/manual_ingestion.py`
- Test: `tests/test_manual_ingestion.py`

**Step 1: Write the failing tests**

Add to `tests/test_manual_ingestion.py`:

```python
from unittest.mock import MagicMock, patch
import pathlib
from core.manual_ingestion import ManualIngestionPipeline
from core.models.types import AnalysisResult

def _make_pipeline(tmp_path, analysis_mode="transcript_only"):
    config = MagicMock()
    config.agent_id = "test-agent"
    config.analysis_mode = analysis_mode
    config.model = "gemini"
    provider = MagicMock()
    return ManualIngestionPipeline(tmp_path, config, provider, soul="AI research"), provider

def test_run_channel_analyzes_only_matching_videos(tmp_path):
    pipeline, provider = _make_pipeline(tmp_path)
    videos = [
        {"id": "match1", "title": "Relevant", "description": ""},
        {"id": "skip1", "title": "Unrelated", "description": ""},
    ]
    provider.screen_videos.return_value = ["match1"]
    provider.analyze_transcript.return_value = AnalysisResult(
        video_id="match1", video_title="Relevant", insights=[], relevance_score=0.9,
        suggested_action="new_concept", suggested_target="test", raw_summary="s",
    )
    with patch("core.manual_ingestion.get_channel_videos", return_value=videos), \
         patch("core.manual_ingestion.fetch_transcript", return_value="transcript text"):
        pipeline.run_channel("https://youtube.com/@test")
    provider.analyze_transcript.assert_called_once()
    assert provider.analyze_transcript.call_args[0][0] == "match1"

def test_run_channel_marks_all_videos_as_processed(tmp_path):
    pipeline, provider = _make_pipeline(tmp_path)
    videos = [
        {"id": "match1", "title": "Relevant", "description": ""},
        {"id": "skip1", "title": "Unrelated", "description": ""},
    ]
    provider.screen_videos.return_value = ["match1"]
    provider.analyze_transcript.return_value = AnalysisResult(
        video_id="match1", video_title="Relevant", insights=[], relevance_score=0.9,
        suggested_action="new_concept", suggested_target="test", raw_summary="s",
    )
    with patch("core.manual_ingestion.get_channel_videos", return_value=videos), \
         patch("core.manual_ingestion.fetch_transcript", return_value="transcript text"):
        pipeline.run_channel("https://youtube.com/@test")
    from core.state import AgentState
    state = AgentState(tmp_path)
    assert "match1" in state.processed_ids
    assert "skip1" in state.processed_ids

def test_run_channel_respects_limit(tmp_path):
    pipeline, provider = _make_pipeline(tmp_path)
    provider.screen_videos.return_value = []
    with patch("core.manual_ingestion.get_channel_videos", return_value=[]) as mock_fetch:
        pipeline.run_channel("https://youtube.com/@test", limit=25)
    mock_fetch.assert_called_once_with("https://youtube.com/@test", 25)
```

**Step 2: Run tests to verify they fail**

```
uv run pytest tests/test_manual_ingestion.py::test_run_channel_analyzes_only_matching_videos -v
```

Expected: FAIL with `AttributeError: 'ManualIngestionPipeline' object has no attribute 'run_channel'`

**Step 3: Add imports and `run_channel` to `core/manual_ingestion.py`**

Add to the imports at the top of the file:

```python
from core.collector import fetch_transcript, get_channel_videos
from core.state import AgentState
```

Remove the existing `from core.collector import fetch_transcript` line and replace with the above.

Add this method to `ManualIngestionPipeline` after `run_file`:

```python
def run_channel(self, url: str, limit: int | None = None) -> None:
    agent_id = self._config.agent_id
    task = "manual-ingest/channel"
    job_status.start(agent_id, task, f"Scanning channel: {url[:80]}")
    try:
        job_status.update_step(agent_id, task, "Fetching video list...")
        videos = get_channel_videos(url, limit)
        if not videos:
            job_status.complete(agent_id, task)
            return

        job_status.update_step(agent_id, task, f"Screening {len(videos)} videos against soul...")
        relevant_ids = set(self._provider.screen_videos(videos, self._soul))

        state = AgentState(self._dir)
        inbox = InboxWriter(self._dir)
        matched = [v for v in videos if v["id"] in relevant_ids]
        total = len(matched)

        for i, video in enumerate(matched, 1):
            vid_id = video["id"]
            vid_title = video["title"]
            vid_url = f"https://www.youtube.com/watch?v={vid_id}"
            job_status.update_step(agent_id, task, f"Analyzing video {i}/{total}: {vid_title[:60]}...")
            try:
                if self._config.analysis_mode == "full_video" and self._config.model == "gemini":
                    result = self._provider.analyze_video(
                        vid_id, vid_title, vid_url, self._soul,
                        "Extract key insights relevant to this agent's domain.",
                    )
                else:
                    transcript = fetch_transcript(vid_id)
                    result = self._provider.analyze_transcript(
                        vid_id, vid_title, transcript, self._soul,
                        "Extract key insights relevant to this agent's domain.",
                    )
                inbox.append("manual", result)
                logger.info(f"[{agent_id}] Channel scan: processed {vid_id} (relevance={result.relevance_score})")
            except Exception as e:
                logger.error(f"[{agent_id}] Channel scan: failed to process {vid_id}: {e}")

        for video in videos:
            state.mark_processed(video["id"])
        state.save()

        job_status.complete(agent_id, task)
    except Exception as e:
        logger.error(f"[{agent_id}] Channel scan failed: {e}")
        job_status.fail(agent_id, task, str(e))
        raise
```

**Step 4: Run tests**

```
uv run pytest tests/test_manual_ingestion.py -v
```

Expected: all PASS

**Step 5: Commit**

```bash
git add core/manual_ingestion.py tests/test_manual_ingestion.py
git commit -m "feat: add run_channel to ManualIngestionPipeline"
```

---

### Task 4: Add two new API endpoints to `api/routers/agents.py`

**Files:**
- Modify: `api/routers/agents.py`
- Modify: `api/schemas.py`

**Step 1: Add schema to `api/schemas.py`**

Add this class alongside the existing `IngestUrlRequest`:

```python
class IngestChannelExecuteRequest(BaseModel):
    url: str
    limit: int | None = None
```

**Step 2: Add endpoints to `api/routers/agents.py`**

First, add to the imports at the top of the file:

```python
from api.schemas import ..., IngestChannelExecuteRequest
from core.collector import is_channel_url, get_channel_videos
```

Then add these two endpoints after the existing `ingest_file` endpoint:

```python
@router.post("/{agent_id}/ingest/channel/preview")
def ingest_channel_preview(
    agent_id: str,
    body: IngestChannelExecuteRequest,
    request: Request,
):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, detail=f"Agent '{agent_id}' not found")
    videos = get_channel_videos(body.url)
    return {"count": len(videos), "videos": videos}


@router.post("/{agent_id}/ingest/channel/execute", status_code=202)
def ingest_channel_execute(
    agent_id: str,
    body: IngestChannelExecuteRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    agents = _get_agents(request)
    if agent_id not in agents:
        raise HTTPException(404, detail=f"Agent '{agent_id}' not found")
    pipeline = agents[agent_id].get("ingestion")
    if not pipeline:
        raise HTTPException(500, detail="Ingestion pipeline not available")
    background_tasks.add_task(pipeline.run_channel, body.url, body.limit)
    return {"status": "queued", "agent_id": agent_id, "url": body.url}
```

**Step 3: Run all tests to verify nothing broke**

```
uv run pytest tests/ -v
```

Expected: all PASS

**Step 4: Commit**

```bash
git add api/schemas.py api/routers/agents.py
git commit -m "feat: add channel preview and execute API endpoints"
```

---

### Task 5: Add API hooks to `web/src/api/agents.ts`

**Files:**
- Modify: `web/src/api/agents.ts`

**Step 1: Add the two hooks at the bottom of the file**

```typescript
export function useChannelPreview(agentId: string) {
  return useMutation({
    mutationFn: (url: string) =>
      apiFetch<{ count: number; videos: { id: string; title: string; description: string }[] }>(
        `/agents/${agentId}/ingest/channel/preview`,
        { method: 'POST', body: JSON.stringify({ url }) }
      ),
  });
}

export function useChannelExecute(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, limit }: { url: string; limit: number | null }) =>
      apiFetch(`/agents/${agentId}/ingest/channel/execute`, {
        method: 'POST',
        body: JSON.stringify({ url, limit }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}
```

**Step 2: Verify the frontend builds**

```
cd web && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors

**Step 3: Commit**

```bash
git add web/src/api/agents.ts
git commit -m "feat: add useChannelPreview and useChannelExecute hooks"
```

---

### Task 6: Update `IngestPanel.tsx` with channel scan UI

**Files:**
- Modify: `web/src/components/IngestPanel.tsx`

**Step 1: Add channel URL regex and new state**

Add at the top of the file alongside existing imports:

```typescript
import { useChannelPreview, useChannelExecute, useIngestUrl, useIngestFile } from '../api/agents';
```

Add the channel URL regex constant near `YT_RE`:

```typescript
const YT_CHANNEL_RE = /youtube\.com\/(@[\w.-]+|c\/[\w.-]+|channel\/UC[\w-]+|user\/[\w.-]+)\/?$/;
```

Add new state inside the component:

```typescript
const channelPreview = useChannelPreview(agent.agent_id);
const channelExecute = useChannelExecute(agent.agent_id);

const [channelConfirm, setChannelConfirm] = useState<{
  count: number;
  videos: { id: string; title: string }[];
} | null>(null);
```

**Step 2: Add `isChannel` derived value and handlers**

Add after the existing `isYouTube` line:

```typescript
const isChannel = YT_CHANNEL_RE.test(url);
```

Add the handler functions:

```typescript
const handleScanChannel = async () => {
  if (!url.trim()) return;
  setUrlMessage('');
  setChannelConfirm(null);
  try {
    const preview = await channelPreview.mutateAsync(url.trim());
    if (preview.count > 50) {
      setChannelConfirm(preview);
    } else {
      await channelExecute.mutateAsync({ url: url.trim(), limit: null });
      setUrlMessage(`Scanning ${preview.count} videos — check Activity for progress.`);
      setUrl('');
    }
  } catch (err) {
    setUrlMessage(`Error: ${(err as Error).message}`);
  }
};

const handleChannelConfirm = async (limit: number | null) => {
  const u = url.trim();
  setChannelConfirm(null);
  try {
    await channelExecute.mutateAsync({ url: u, limit });
    setUrlMessage(`Scanning queued — check Activity for progress.`);
    setUrl('');
  } catch (err) {
    setUrlMessage(`Error: ${(err as Error).message}`);
  }
};
```

**Step 3: Update the URL section JSX**

Replace the existing Ingest URL button with this conditional:

```tsx
{isChannel ? (
  <button
    onClick={handleScanChannel}
    disabled={!url.trim() || channelPreview.isPending || channelExecute.isPending}
    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 rounded text-sm font-medium transition-colors"
  >
    {channelPreview.isPending ? 'Fetching...' : 'Scan Channel'}
  </button>
) : (
  <button
    onClick={handleIngestUrl}
    disabled={!url.trim() || ingestUrl.isPending}
    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-sm font-medium transition-colors"
  >
    {ingestUrl.isPending ? 'Queuing...' : 'Ingest URL'}
  </button>
)}
```

Add the confirmation dialog block after the button, before `{urlMessage && ...}`:

```tsx
{channelConfirm && (
  <div className="bg-amber-950/40 border border-amber-700/50 rounded-lg p-4 space-y-3">
    <p className="text-sm text-amber-300">
      This channel has <span className="font-bold">{channelConfirm.count} videos</span>. How many should be scanned?
    </p>
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => handleChannelConfirm(50)}
        className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 rounded text-xs font-medium transition-colors"
      >
        First 50
      </button>
      <button
        onClick={() => handleChannelConfirm(null)}
        className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 rounded text-xs font-medium transition-colors"
      >
        All {channelConfirm.count}
      </button>
      <button
        onClick={() => { setChannelConfirm(null); setUrl(''); }}
        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-300"
      >
        Cancel
      </button>
    </div>
  </div>
)}
```

Also update the activity watcher to include `manual-ingest/channel`:

```typescript
if (!job.task.startsWith('manual-ingest')) continue;
```

This already covers it since `manual-ingest/channel` starts with `manual-ingest`.

**Step 4: Build to verify no TypeScript errors**

```
cd web && npm run build 2>&1 | tail -20
```

Expected: build succeeds

**Step 5: Commit**

```bash
git add web/src/components/IngestPanel.tsx
git commit -m "feat: channel scan UI with inline confirmation for large channels"
```

---

### Task 7: Smoke test end-to-end

**Step 1: Start the dev server**

```powershell
./Start-Dev.ps1
```

**Step 2: Manual verification checklist**

1. Open an agent's **Ingest** tab
2. Paste a YouTube **video** URL → badge shows `YouTube`, button shows `Ingest URL` ✓
3. Paste a YouTube **channel** URL (e.g. `https://www.youtube.com/@mkbhd`) → badge shows `YouTube`, button changes to `Scan Channel` (amber) ✓
4. Click **Scan Channel** → spinner shows `Fetching...`
   - If channel has ≤ 50 videos: job queued immediately, success message appears ✓
   - If channel has > 50 videos: amber warning appears with video count and 3 buttons ✓
5. Click **First 50** → job queued, Activity panel shows `manual-ingest/channel` job with step updates ✓
6. After job completes, inbox count increases ✓
7. Re-scanning same channel → screened-out videos do not reappear (they're in `state.json`) ✓

**Step 3: Run full test suite**

```
uv run pytest tests/ -v
```

Expected: all tests PASS
