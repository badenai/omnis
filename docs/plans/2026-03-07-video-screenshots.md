# Video Screenshot Extraction Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When running in `full_video` mode, ask Gemini to identify the most visually significant timestamps during analysis, then extract still frames at those timestamps using yt-dlp + ffmpeg and store them alongside the knowledge files. Screenshots surface in the Knowledge Browser so users can see what was captured.

**Why:** Transcripts miss everything visual — charts, code on screen, architecture diagrams, whiteboards, demo UIs. In `full_video` mode Gemini already sees all of this; screenshots let that visual insight persist into the knowledge base rather than being described only in words.

**Constraints:**
- `full_video` + `gemini` model only — transcript_only mode never sees the video
- Requires ffmpeg installed on the server
- Requires downloading the video temporarily (yt-dlp), then deleting it
- Gemini timestamp accuracy can be off by a few seconds — acceptable for screenshots
- Max 5 screenshots per video to keep storage and cost reasonable

**Tech Stack:** Python (`yt-dlp`, `ffmpeg` via subprocess), FastAPI, React + TypeScript

---

### Task 1: Extend the analysis schema and result types

**Files:**
- Modify: `core/models/gemini.py` — `_ANALYSIS_SCHEMA`
- Modify: `core/models/types.py` — `AnalysisResult`

**Step 1: Add `key_timestamps` to `_ANALYSIS_SCHEMA` in `gemini.py`**

Append to the JSON schema string so Gemini returns timestamps alongside insights:

```python
# Add to _ANALYSIS_SCHEMA after the existing fields:
#   "key_timestamps": [{"seconds": 142, "reason": "Chart showing X"}]
# Cap at 5 entries. Only include if the visual content meaningfully adds
# to the text insights. Omit entirely if content is talking-head only.
```

Full addition to the schema string:
```
  "key_timestamps": [{"seconds": <int>, "reason": "<one sentence describing what is visible>"}]
```

**Step 2: Add `key_timestamps` to `AnalysisResult` in `types.py`**

```python
@dataclass
class KeyTimestamp:
    seconds: int
    reason: str

@dataclass
class AnalysisResult:
    ...
    key_timestamps: list[KeyTimestamp] = field(default_factory=list)
```

**Step 3: Parse `key_timestamps` in `_build_analysis_result` in `gemini.py`**

```python
raw_ts = data.get("key_timestamps", [])
key_timestamps = [
    KeyTimestamp(seconds=int(t["seconds"]), reason=t.get("reason", ""))
    for t in raw_ts if isinstance(t, dict) and "seconds" in t
]
```

**Verification:** Run existing tests — `AnalysisResult` construction must still work with no `key_timestamps` key in the JSON response (defaults to empty list).

---

### Task 2: Frame extraction utility

**Files:**
- Create: `core/video_frames.py`

**Step 1: Write `extract_frames(video_id, timestamps, output_dir)`**

```python
# core/video_frames.py
import subprocess
import pathlib
import tempfile
import yt_dlp

def extract_frames(
    video_id: str,
    timestamps: list[int],   # seconds
    output_dir: pathlib.Path,
) -> list[pathlib.Path]:
    """
    Download video to a temp file, extract one JPEG per timestamp,
    save to output_dir/<video_id>_<seconds>s.jpg, delete the download.
    Returns list of saved frame paths.
    """
```

Implementation notes:
- Use `yt_dlp` with `format: "bestvideo[height<=720][ext=mp4]/bestvideo[height<=720]"` — cap at 720p to keep download size manageable
- Download to `tempfile.mkdtemp()`, always delete in `finally`
- For each timestamp run: `ffmpeg -ss <seconds> -i <video.mp4> -frames:v 1 -q:v 2 <output>.jpg`
- Respect `YOUTUBE_COOKIES_FILE` and `HTTPS_PROXY` env vars (same as `collector.py`)
- If ffmpeg is not installed, raise `RuntimeError("ffmpeg not found — install ffmpeg on the server")`
- If a single timestamp fails, log and skip (don't abort the whole batch)
- Return only successfully written paths

**Verification:** Write a manual test: pick a known public video ID, call `extract_frames` with `[10, 30]`, confirm two JPEGs exist and are non-empty.

---

### Task 3: Integrate frame extraction into the collection pipeline

**Files:**
- Modify: `core/pipeline.py` — `run_collection()`

**Step 1: After a successful `analyze_video` call, extract frames if timestamps were returned**

In the `full_video` branch inside the video loop, after `inbox.append(...)`:

```python
if result.key_timestamps and self._config.analysis_mode == "full_video":
    from core.video_frames import extract_frames
    screenshots_dir = self._dir / "knowledge" / "screenshots"
    screenshots_dir.mkdir(parents=True, exist_ok=True)
    try:
        job_status.log(agent_id, task, f"[{i}/{total}] Extracting {len(result.key_timestamps)} screenshot(s)…")
        saved = extract_frames(
            vid_id,
            [t.seconds for t in result.key_timestamps],
            screenshots_dir,
        )
        job_status.log(agent_id, task, f"[{i}/{total}] {len(saved)} screenshot(s) saved")
    except Exception as e:
        job_status.log(agent_id, task, f"[{i}/{total}] Screenshot extraction failed (non-fatal): {e}")
```

Screenshot naming: `<video_id>_<seconds>s.jpg` — unique per video, no collisions.

**Step 2: Write a sidecar metadata file per video**

Alongside the screenshots, write `<video_id>_timestamps.json`:

```json
{
  "video_id": "abc123",
  "title": "...",
  "frames": [
    {"seconds": 142, "reason": "Architecture diagram", "file": "abc123_142s.jpg"},
    {"seconds": 380, "reason": "Benchmark chart", "file": "abc123_380s.jpg"}
  ]
}
```

This lets the UI display the reason without re-querying Gemini.

**Verification:**
1. Trigger a `full_video` collection on an agent
2. Confirm `knowledge/screenshots/<video_id>_<N>s.jpg` files exist
3. Confirm `knowledge/screenshots/<video_id>_timestamps.json` exists and parses correctly
4. Confirm the activity log shows the screenshot lines

---

### Task 4: API endpoint to serve screenshots

**Files:**
- Modify: `api/` — add screenshot routes

**Step 1: Add two endpoints**

```
GET /api/agents/{agent_id}/screenshots
→ returns list of all {video_id, title, frames: [{seconds, reason, file}]}
  by reading all *_timestamps.json files in knowledge/screenshots/

GET /api/agents/{agent_id}/screenshots/{filename}
→ streams the JPEG file (FileResponse)
```

**Verification:** `curl http://localhost:8420/api/agents/<id>/screenshots` returns JSON array. `curl http://localhost:8420/api/agents/<id>/screenshots/<video_id>_142s.jpg` returns the image.

---

### Task 5: Surface screenshots in the Knowledge Browser

**Files:**
- Modify: `web/src/components/KnowledgeBrowser.tsx` (or relevant knowledge tab component)

**Step 1: Add a "Screenshots" section below the knowledge file list**

- Fetch from `/api/agents/{agent_id}/screenshots`
- Group by video (collapsible per video)
- Each frame: thumbnail (150px wide) + reason text beneath
- Clicking a thumbnail opens it full-size in a lightbox or new tab
- Show nothing if the list is empty (screenshots only appear in `full_video` mode)

**Verification:**
1. After a `full_video` collection run, open the Knowledge Browser
2. Confirm screenshots section appears with thumbnails and reasons
3. Confirm clicking a thumbnail opens the full image

---

## Server Setup Note

Before enabling `full_video` screenshot extraction, ensure ffmpeg is installed on the deployment server:

```bash
apt-get install -y ffmpeg
ffmpeg -version  # confirm
```

Add to the deployment / provisioning docs.
