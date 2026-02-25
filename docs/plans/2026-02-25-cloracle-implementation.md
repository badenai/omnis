# cloracle Knowledge Agent System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local Python service that runs knowledge agents with a heartbeat, monitors YouTube channels for new videos, accumulates domain knowledge as structured Markdown files, and auto-generates Claude Code skills that implementation agents can inject as context.

**Architecture:** APScheduler drives two loops per agent — a daily collection loop (YouTube check → AI analysis → INBOX.md) and a weekly consolidation loop (INBOX → knowledge graph → briefing.md → SKILL.md). Each agent lives in `~/.cloracle/agents/<id>/` with a SOUL.md, config.yaml, and auto-generated SKILL.md. A Provider protocol abstracts Gemini/OpenAI/Claude.

**Tech Stack:** Python 3.11+, APScheduler, yt-dlp, youtube-transcript-api, google-generativeai, python-frontmatter, PyYAML, pytest, pytest-mock

---

## Task 1: Project Scaffolding

**Files:**
- Create: `requirements.txt`
- Create: `pyproject.toml`
- Create: `core/__init__.py`
- Create: `core/models/__init__.py`
- Create: `tests/__init__.py`
- Create: `tests/fixtures/__init__.py`

**Step 1: Initialize git repo**

```bash
cd C:/Users/DanielBaden/ai/cloracle
git init
```

**Step 2: Create `requirements.txt`**

```
APScheduler>=3.10.4
yt-dlp>=2024.1.1
youtube-transcript-api>=0.6.2
google-generativeai>=0.8.0
openai>=1.40.0
anthropic>=0.34.0
python-frontmatter>=1.1.0
PyYAML>=6.0.1
pytest>=8.0.0
pytest-mock>=3.14.0
```

**Step 3: Create `pyproject.toml`**

```toml
[build-system]
requires = ["setuptools"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

**Step 4: Create `core/__init__.py`, `core/models/__init__.py`, `tests/__init__.py`, `tests/fixtures/__init__.py`** (all empty files)

**Step 5: Verify structure**

```bash
find . -type f -name "*.py" | sort
```
Expected: the 4 `__init__.py` files listed.

**Step 6: Install dependencies**

```bash
pip install -r requirements.txt
```

**Step 7: Commit**

```bash
git add .
git commit -m "chore: initial project scaffolding"
```

---

## Task 2: Data Models (dataclasses, no logic)

**Files:**
- Create: `core/models/types.py`
- Create: `tests/test_types.py`

**Step 1: Write failing test**

```python
# tests/test_types.py
from core.models.types import AnalysisResult, ConsolidationResult, AgentConfig

def test_analysis_result_fields():
    r = AnalysisResult(
        video_id="abc123",
        video_title="Test Video",
        insights=["insight 1"],
        relevance_score=0.85,
        suggested_action="update_concept",
        suggested_target="support-resistance",
        raw_summary="raw text",
    )
    assert r.relevance_score == 0.85
    assert r.video_id == "abc123"

def test_agent_config_defaults():
    cfg = AgentConfig(
        agent_id="test-agent",
        mode="accumulate",
        model="gemini",
        analysis_mode="full_video",
        sources={"youtube_channels": []},
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365},
    )
    assert cfg.mode == "accumulate"
```

**Step 2: Run to confirm failure**

```bash
pytest tests/test_types.py -v
```
Expected: `ModuleNotFoundError: No module named 'core.models.types'`

**Step 3: Implement `core/models/types.py`**

```python
from dataclasses import dataclass, field


@dataclass
class AnalysisResult:
    video_id: str
    video_title: str
    insights: list[str]
    relevance_score: float
    suggested_action: str          # "update_concept" | "new_concept" | "new_recent"
    suggested_target: str          # filename hint (without extension)
    raw_summary: str


@dataclass
class ConsolidationResult:
    updated_files: list[str]
    created_files: list[str]
    errors: list[str] = field(default_factory=list)


@dataclass
class AgentConfig:
    agent_id: str
    mode: str                      # "accumulate" | "watch"
    model: str                     # "gemini" | "openai" | "claude"
    analysis_mode: str             # "full_video" | "transcript_only"
    sources: dict
    consolidation_schedule: str
    decay: dict
```

**Step 4: Run tests**

```bash
pytest tests/test_types.py -v
```
Expected: 2 PASSED

**Step 5: Commit**

```bash
git add core/models/types.py tests/test_types.py
git commit -m "feat: add core data model types"
```

---

## Task 3: Provider Protocol + Gemini Implementation

**Files:**
- Create: `core/models/base.py`
- Create: `core/models/gemini.py`
- Create: `tests/test_gemini_provider.py`

**Step 1: Write failing tests**

```python
# tests/test_gemini_provider.py
from unittest.mock import MagicMock, patch
from core.models.gemini import GeminiProvider
from core.models.types import AnalysisResult

SOUL = "I am a trading knowledge agent."
PROMPT = "Extract trading insights."

def test_analyze_transcript_returns_analysis_result(mocker):
    mock_genai = mocker.patch("core.models.gemini.genai")
    mock_model = MagicMock()
    mock_genai.GenerativeModel.return_value = mock_model
    mock_model.generate_content.return_value.text = """{
        "video_id": "abc123",
        "video_title": "Test",
        "insights": ["insight 1"],
        "relevance_score": 0.8,
        "suggested_action": "new_concept",
        "suggested_target": "test-concept",
        "raw_summary": "summary"
    }"""

    provider = GeminiProvider(api_key="fake-key")
    result = provider.analyze_transcript("abc123", "Test", "transcript text", SOUL, PROMPT)

    assert isinstance(result, AnalysisResult)
    assert result.relevance_score == 0.8

def test_analyze_video_uses_url(mocker):
    mock_genai = mocker.patch("core.models.gemini.genai")
    mock_model = MagicMock()
    mock_genai.GenerativeModel.return_value = mock_model
    mock_model.generate_content.return_value.text = """{
        "video_id": "xyz",
        "video_title": "YT Video",
        "insights": [],
        "relevance_score": 0.5,
        "suggested_action": "new_recent",
        "suggested_target": "recent-note",
        "raw_summary": ""
    }"""

    provider = GeminiProvider(api_key="fake-key")
    result = provider.analyze_video("xyz", "YT Video", "https://youtube.com/watch?v=xyz", SOUL, PROMPT)

    assert isinstance(result, AnalysisResult)
    # Verify the call included the URL
    call_args = mock_model.generate_content.call_args[0][0]
    assert any("youtube.com" in str(part) for part in call_args)
```

**Step 2: Run to confirm failure**

```bash
pytest tests/test_gemini_provider.py -v
```
Expected: `ModuleNotFoundError`

**Step 3: Implement `core/models/base.py`**

```python
from typing import Protocol
from core.models.types import AnalysisResult, ConsolidationResult


class KnowledgeProvider(Protocol):
    def analyze_transcript(
        self, video_id: str, video_title: str, transcript: str, soul: str, prompt: str
    ) -> AnalysisResult: ...

    def analyze_video(
        self, video_id: str, video_title: str, video_url: str, soul: str, prompt: str
    ) -> AnalysisResult: ...

    def generate_briefing(self, knowledge_files: list[dict], soul: str, mode: str) -> str: ...

    def generate_skill(self, briefing: str, soul: str, agent_id: str) -> str: ...

    def consolidate(
        self, inbox_items: list[str], existing_index: str, soul: str
    ) -> ConsolidationResult: ...
```

**Step 4: Implement `core/models/gemini.py`**

```python
import json
import google.generativeai as genai
from core.models.types import AnalysisResult, ConsolidationResult

_ANALYSIS_SCHEMA = """
Respond with valid JSON only, no markdown fences:
{
  "video_id": "<id>",
  "video_title": "<title>",
  "insights": ["<insight>", ...],
  "relevance_score": <0.0-1.0>,
  "suggested_action": "<update_concept|new_concept|new_recent>",
  "suggested_target": "<filename-hint-no-extension>",
  "raw_summary": "<full summary>"
}
"""


class GeminiProvider:
    def __init__(self, api_key: str, model_name: str = "gemini-1.5-pro"):
        genai.configure(api_key=api_key)
        self._model = genai.GenerativeModel(model_name)

    def _parse_result(self, raw: str) -> dict:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(text)

    def analyze_transcript(
        self, video_id: str, video_title: str, transcript: str, soul: str, prompt: str
    ) -> AnalysisResult:
        full_prompt = [
            f"AGENT SOUL:\n{soul}\n\nTASK:\n{prompt}\n\n{_ANALYSIS_SCHEMA}",
            f"VIDEO ID: {video_id}\nTITLE: {video_title}\n\nTRANSCRIPT:\n{transcript}",
        ]
        response = self._model.generate_content(full_prompt)
        data = self._parse_result(response.text)
        return AnalysisResult(**data)

    def analyze_video(
        self, video_id: str, video_title: str, video_url: str, soul: str, prompt: str
    ) -> AnalysisResult:
        full_prompt = [
            f"AGENT SOUL:\n{soul}\n\nTASK:\n{prompt}\n\n{_ANALYSIS_SCHEMA}",
            f"VIDEO ID: {video_id}\nTITLE: {video_title}\nURL: {video_url}",
            {"file_data": {"mime_type": "video/*", "file_uri": video_url}},
        ]
        response = self._model.generate_content(full_prompt)
        data = self._parse_result(response.text)
        return AnalysisResult(**data)

    def generate_briefing(self, knowledge_files: list[dict], soul: str, mode: str) -> str:
        files_text = "\n\n---\n\n".join(
            f"# {f['path']}\n{f['content']}" for f in knowledge_files
        )
        prompt = f"""AGENT SOUL:\n{soul}

Mode: {mode}

Based on the following knowledge files (sorted by effective_weight descending),
write a comprehensive briefing document in Markdown. Structure:
- For 'accumulate': Core Concepts → Strategies → Implementation Guidance
- For 'watch': Recent Developments → Trends → Opportunity Suggestions

KNOWLEDGE FILES:
{files_text}"""
        response = self._model.generate_content(prompt)
        return response.text

    def generate_skill(self, briefing: str, soul: str, agent_id: str) -> str:
        prompt = f"""AGENT SOUL:\n{soul}

Convert the following briefing into a Claude Code SKILL.md file.
The skill should have YAML frontmatter with name, description, last_updated fields.
The body should be structured as a knowledge injection prompt — concise, actionable,
ready to be used as context for an implementation agent.

BRIEFING:
{briefing}"""
        response = self._model.generate_content(prompt)
        return response.text

    def consolidate(
        self, inbox_items: list[str], existing_index: str, soul: str
    ) -> ConsolidationResult:
        inbox_text = "\n\n---\n\n".join(inbox_items)
        prompt = f"""AGENT SOUL:\n{soul}

EXISTING KNOWLEDGE INDEX:
{existing_index}

NEW INBOX ITEMS:
{inbox_text}

For each inbox item, decide:
1. Does it update an existing concept? (suggested_action: update_concept, target: filename)
2. Is it a genuinely new concept? (new_concept, target: filename-hint)
3. Is it time-sensitive news? (new_recent, target: filename-hint)

Respond with JSON only:
{{
  "decisions": [
    {{"inbox_index": 0, "action": "update_concept", "target": "support-resistance"}},
    ...
  ]
}}"""
        response = self._model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        data = json.loads(text)
        return ConsolidationResult(updated_files=[], created_files=[], errors=[])
```

**Step 5: Run tests**

```bash
pytest tests/test_gemini_provider.py -v
```
Expected: 2 PASSED

**Step 6: Commit**

```bash
git add core/models/base.py core/models/gemini.py tests/test_gemini_provider.py
git commit -m "feat: add Provider protocol and Gemini implementation"
```

---

## Task 4: Config Loader

**Files:**
- Create: `core/config.py`
- Create: `tests/fixtures/trading-agent-config.yaml`
- Create: `tests/test_config.py`

**Step 1: Write failing test**

```python
# tests/test_config.py
import os, pathlib
from core.config import load_agent_config, load_soul

FIXTURES = pathlib.Path(__file__).parent / "fixtures"

def test_load_agent_config():
    cfg = load_agent_config(FIXTURES / "trading-agent-config.yaml")
    assert cfg.agent_id == "trading-price-action"
    assert cfg.mode == "accumulate"
    assert cfg.model == "gemini"
    assert len(cfg.sources["youtube_channels"]) == 1

def test_load_soul(tmp_path):
    soul_file = tmp_path / "SOUL.md"
    soul_file.write_text("# Test Agent\n\n## Mission\nTest mission.")
    soul = load_soul(tmp_path)
    assert "Test mission" in soul
```

**Step 2: Run to confirm failure**

```bash
pytest tests/test_config.py -v
```
Expected: `ModuleNotFoundError`

**Step 3: Create `tests/fixtures/trading-agent-config.yaml`**

```yaml
agent_id: trading-price-action
mode: accumulate
model: gemini
analysis_mode: full_video
sources:
  youtube_channels:
    - handle: "@TestChannel"
      check_schedule: "0 8 * * *"
consolidation_schedule: "0 3 * * 0"
decay:
  half_life_days: 365
```

**Step 4: Implement `core/config.py`**

```python
import pathlib
import yaml
from core.models.types import AgentConfig


def load_agent_config(config_path: pathlib.Path) -> AgentConfig:
    with open(config_path) as f:
        data = yaml.safe_load(f)
    return AgentConfig(
        agent_id=data["agent_id"],
        mode=data["mode"],
        model=data["model"],
        analysis_mode=data.get("analysis_mode", "transcript_only"),
        sources=data.get("sources", {}),
        consolidation_schedule=data.get("consolidation_schedule", "0 3 * * 0"),
        decay=data.get("decay", {"half_life_days": 365}),
    )


def load_soul(agent_dir: pathlib.Path) -> str:
    soul_file = agent_dir / "SOUL.md"
    if soul_file.exists():
        return soul_file.read_text(encoding="utf-8")
    return ""
```

**Step 5: Run tests**

```bash
pytest tests/test_config.py -v
```
Expected: 2 PASSED

**Step 6: Commit**

```bash
git add core/config.py tests/fixtures/trading-agent-config.yaml tests/test_config.py
git commit -m "feat: add config loader"
```

---

## Task 5: Collector (YouTube Channel Check)

**Files:**
- Create: `core/collector.py`
- Create: `tests/test_collector.py`

**Step 1: Write failing tests**

```python
# tests/test_collector.py
from unittest.mock import MagicMock, patch
from core.collector import get_new_videos, fetch_transcript

def test_get_new_videos_filters_processed(mocker):
    mock_ydl = MagicMock()
    mock_ydl.__enter__ = lambda s: s
    mock_ydl.__exit__ = MagicMock(return_value=False)
    mock_ydl.extract_info.return_value = {
        "entries": [
            {"id": "new-video", "title": "New Video", "webpage_url": "https://yt.com/watch?v=new-video"},
            {"id": "old-video", "title": "Old Video", "webpage_url": "https://yt.com/watch?v=old-video"},
        ]
    }
    mocker.patch("core.collector.yt_dlp.YoutubeDL", return_value=mock_ydl)

    already_processed = {"old-video"}
    results = get_new_videos("@TestChannel", already_processed)

    assert len(results) == 1
    assert results[0]["id"] == "new-video"

def test_fetch_transcript_returns_text(mocker):
    mock_transcript = mocker.patch("core.collector.YouTubeTranscriptApi.get_transcript")
    mock_transcript.return_value = [
        {"text": "Hello world"},
        {"text": "Second sentence"},
    ]
    result = fetch_transcript("video-id")
    assert "Hello world" in result
    assert "Second sentence" in result
```

**Step 2: Run to confirm failure**

```bash
pytest tests/test_collector.py -v
```
Expected: `ModuleNotFoundError`

**Step 3: Implement `core/collector.py`**

```python
import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi


def get_new_videos(channel_handle: str, processed_ids: set[str]) -> list[dict]:
    """Fetch recent videos from a YouTube channel, excluding already-processed IDs."""
    url = f"https://www.youtube.com/{channel_handle}/videos"
    opts = {
        "quiet": True,
        "extract_flat": True,
        "playlistend": 10,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    entries = info.get("entries", []) if info else []
    return [e for e in entries if e.get("id") not in processed_ids]


def fetch_transcript(video_id: str) -> str:
    """Download and join transcript segments into plain text."""
    segments = YouTubeTranscriptApi.get_transcript(video_id)
    return " ".join(s["text"] for s in segments)
```

**Step 4: Run tests**

```bash
pytest tests/test_collector.py -v
```
Expected: 2 PASSED

**Step 5: Commit**

```bash
git add core/collector.py tests/test_collector.py
git commit -m "feat: add YouTube collector"
```

---

## Task 6: State Manager

**Files:**
- Create: `core/state.py`
- Create: `tests/test_state.py`

**Step 1: Write failing tests**

```python
# tests/test_state.py
import json, pathlib
from core.state import AgentState

def test_load_creates_empty_state_if_missing(tmp_path):
    state = AgentState(tmp_path)
    assert state.processed_ids == set()

def test_mark_processed_persists(tmp_path):
    state = AgentState(tmp_path)
    state.mark_processed("vid-abc")
    state.save()

    state2 = AgentState(tmp_path)
    assert "vid-abc" in state2.processed_ids

def test_update_last_checked(tmp_path):
    state = AgentState(tmp_path)
    state.update_last_checked("@TestChannel", "2026-02-25T08:00:00Z")
    state.save()

    state2 = AgentState(tmp_path)
    assert state2.last_checked["@TestChannel"] == "2026-02-25T08:00:00Z"
```

**Step 2: Run to confirm failure**

```bash
pytest tests/test_state.py -v
```

**Step 3: Implement `core/state.py`**

```python
import json
import pathlib
from datetime import datetime, timezone


class AgentState:
    def __init__(self, agent_dir: pathlib.Path):
        self._path = agent_dir / "state.json"
        self._data = self._load()

    def _load(self) -> dict:
        if self._path.exists():
            return json.loads(self._path.read_text(encoding="utf-8"))
        return {"processed_video_ids": [], "last_checked": {}, "last_consolidation": None}

    @property
    def processed_ids(self) -> set:
        return set(self._data["processed_video_ids"])

    @property
    def last_checked(self) -> dict:
        return self._data["last_checked"]

    def mark_processed(self, video_id: str) -> None:
        if video_id not in self._data["processed_video_ids"]:
            self._data["processed_video_ids"].append(video_id)

    def update_last_checked(self, channel_handle: str, timestamp: str) -> None:
        self._data["last_checked"][channel_handle] = timestamp

    def update_last_consolidation(self) -> None:
        self._data["last_consolidation"] = datetime.now(timezone.utc).isoformat()

    def save(self) -> None:
        self._path.write_text(json.dumps(self._data, indent=2), encoding="utf-8")
```

**Step 4: Run tests**

```bash
pytest tests/test_state.py -v
```
Expected: 3 PASSED

**Step 5: Commit**

```bash
git add core/state.py tests/test_state.py
git commit -m "feat: add agent state manager"
```

---

## Task 7: INBOX Writer

**Files:**
- Create: `core/inbox.py`
- Create: `tests/test_inbox.py`

**Step 1: Write failing tests**

```python
# tests/test_inbox.py
import pathlib
from core.inbox import InboxWriter
from core.models.types import AnalysisResult

def _make_result():
    return AnalysisResult(
        video_id="abc123",
        video_title="Test Video",
        insights=["insight one", "insight two"],
        relevance_score=0.91,
        suggested_action="new_concept",
        suggested_target="support-resistance",
        raw_summary="A summary.",
    )

def test_append_creates_inbox(tmp_path):
    writer = InboxWriter(tmp_path)
    writer.append("@TestChan", _make_result())
    inbox = (tmp_path / "INBOX.md").read_text()
    assert "abc123" in inbox
    assert "insight one" in inbox
    assert "0.91" in inbox

def test_append_multiple_entries(tmp_path):
    writer = InboxWriter(tmp_path)
    writer.append("@Chan", _make_result())
    writer.append("@Chan", _make_result())
    inbox = (tmp_path / "INBOX.md").read_text()
    assert inbox.count("abc123") == 2

def test_read_items_returns_list(tmp_path):
    writer = InboxWriter(tmp_path)
    writer.append("@Chan", _make_result())
    writer.append("@Chan", _make_result())
    items = writer.read_items()
    assert len(items) == 2

def test_clear_empties_inbox(tmp_path):
    writer = InboxWriter(tmp_path)
    writer.append("@Chan", _make_result())
    writer.clear()
    assert not (tmp_path / "INBOX.md").exists()
```

**Step 2: Run to confirm failure**

```bash
pytest tests/test_inbox.py -v
```

**Step 3: Implement `core/inbox.py`**

```python
import pathlib
from datetime import datetime, timezone
from core.models.types import AnalysisResult

_SEPARATOR = "\n<!-- INBOX_ENTRY_SEPARATOR -->\n"


class InboxWriter:
    def __init__(self, agent_dir: pathlib.Path):
        self._path = agent_dir / "INBOX.md"

    def append(self, channel: str, result: AnalysisResult) -> None:
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        insights_md = "\n".join(f"- {i}" for i in result.insights)
        entry = (
            f"## {now} | {channel} | {result.video_id}\n"
            f"**Title:** {result.video_title}  \n"
            f"**Relevance Score:** {result.relevance_score}  \n"
            f"**Suggested Action:** {result.suggested_action} → `{result.suggested_target}`\n\n"
            f"### Key Insights\n{insights_md}\n\n"
            f"### Summary\n{result.raw_summary}\n"
        )
        with open(self._path, "a", encoding="utf-8") as f:
            if self._path.stat().st_size > 0 if self._path.exists() else False:
                f.write(_SEPARATOR)
            f.write(entry)

    def read_items(self) -> list[str]:
        if not self._path.exists():
            return []
        content = self._path.read_text(encoding="utf-8")
        return [item.strip() for item in content.split(_SEPARATOR) if item.strip()]

    def clear(self) -> None:
        if self._path.exists():
            self._path.unlink()
```

**Step 4: Run tests**

```bash
pytest tests/test_inbox.py -v
```
Expected: 4 PASSED

**Step 5: Commit**

```bash
git add core/inbox.py tests/test_inbox.py
git commit -m "feat: add INBOX writer"
```

---

## Task 8: Knowledge Writer (concept/recent files)

**Files:**
- Create: `core/knowledge.py`
- Create: `tests/test_knowledge.py`

**Step 1: Write failing tests**

```python
# tests/test_knowledge.py
import math, pathlib
from datetime import datetime, timezone, timedelta
import frontmatter
from core.knowledge import KnowledgeWriter

def test_write_new_concept(tmp_path):
    kw = KnowledgeWriter(tmp_path, half_life_days=365)
    kw.write_concept("support-resistance", "# Support & Resistance\n\nContent here.", tags=["price-action"])
    f = tmp_path / "knowledge" / "concepts" / "support-resistance.md"
    assert f.exists()
    post = frontmatter.load(str(f))
    assert post["relevance_score"] == 1.0
    assert "price-action" in post["tags"]

def test_write_recent_entry(tmp_path):
    kw = KnowledgeWriter(tmp_path, half_life_days=365)
    kw.write_recent("yt-abc123", "# Recent Note\nContent.", source_id="abc123")
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    f = tmp_path / "knowledge" / "recent" / month / "yt-abc123.md"
    assert f.exists()

def test_effective_weight_decays_over_time(tmp_path):
    kw = KnowledgeWriter(tmp_path, half_life_days=30)
    # Score 1.0, 30 days old → effective weight should be ~0.5
    weight = kw.compute_effective_weight(relevance_score=1.0, age_days=30)
    assert abs(weight - 0.5) < 0.01
```

**Step 2: Run to confirm failure**

```bash
pytest tests/test_knowledge.py -v
```

**Step 3: Implement `core/knowledge.py`**

```python
import math
import pathlib
from datetime import datetime, timezone

import frontmatter


class KnowledgeWriter:
    def __init__(self, agent_dir: pathlib.Path, half_life_days: int):
        self._base = agent_dir / "knowledge"
        self._half_life = half_life_days

    def compute_effective_weight(self, relevance_score: float, age_days: float) -> float:
        decay = math.exp(-math.log(2) * age_days / self._half_life)
        return round(relevance_score * decay, 4)

    def write_concept(self, name: str, content: str, tags: list[str] | None = None) -> pathlib.Path:
        dest = self._base / "concepts" / f"{name}.md"
        dest.parent.mkdir(parents=True, exist_ok=True)
        now = datetime.now(timezone.utc).date().isoformat()
        metadata = {
            "created": now,
            "updated": now,
            "relevance_score": 1.0,
            "effective_weight": 1.0,
            "decay_half_life": self._half_life,
            "sources": [],
            "tags": tags or [],
        }
        post = frontmatter.Post(content, **metadata)
        dest.write_text(frontmatter.dumps(post), encoding="utf-8")
        return dest

    def update_concept(self, name: str, new_content: str, source_id: str) -> pathlib.Path:
        dest = self._base / "concepts" / f"{name}.md"
        if dest.exists():
            post = frontmatter.load(str(dest))
            post.content = new_content
            post["updated"] = datetime.now(timezone.utc).date().isoformat()
            if source_id not in post.get("sources", []):
                post["sources"] = post.get("sources", []) + [source_id]
        else:
            post = frontmatter.Post(new_content, sources=[source_id])
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(frontmatter.dumps(post), encoding="utf-8")
        return dest

    def write_recent(self, name: str, content: str, source_id: str) -> pathlib.Path:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        dest = self._base / "recent" / month / f"{name}.md"
        dest.parent.mkdir(parents=True, exist_ok=True)
        now = datetime.now(timezone.utc).date().isoformat()
        metadata = {
            "created": now,
            "updated": now,
            "relevance_score": 1.0,
            "decay_half_life": self._half_life,
            "sources": [source_id],
            "tags": [],
        }
        post = frontmatter.Post(content, **metadata)
        dest.write_text(frontmatter.dumps(post), encoding="utf-8")
        return dest

    def load_all_weighted(self) -> list[dict]:
        """Load all knowledge files sorted by effective_weight descending."""
        from datetime import date
        files = []
        for f in self._base.rglob("*.md"):
            if f.name == "_index.md":
                continue
            post = frontmatter.load(str(f))
            created_str = post.get("created", date.today().isoformat())
            created = date.fromisoformat(str(created_str))
            age = (date.today() - created).days
            score = float(post.get("relevance_score", 1.0))
            weight = self.compute_effective_weight(score, age)
            files.append({
                "path": str(f.relative_to(self._base)),
                "content": post.content,
                "effective_weight": weight,
                "metadata": dict(post.metadata),
            })
        return sorted(files, key=lambda x: x["effective_weight"], reverse=True)
```

**Step 4: Run tests**

```bash
pytest tests/test_knowledge.py -v
```
Expected: 3 PASSED

**Step 5: Commit**

```bash
git add core/knowledge.py tests/test_knowledge.py
git commit -m "feat: add knowledge writer with temporal decay"
```

---

## Task 9: Skill Writer + Registry

**Files:**
- Create: `core/skill_writer.py`
- Create: `core/registry.py`
- Create: `tests/test_skill_writer.py`

**Step 1: Write failing tests**

```python
# tests/test_skill_writer.py
import pathlib, json
from core.skill_writer import SkillWriter
from core.registry import Registry

def test_write_skill_creates_file(tmp_path):
    agent_dir = tmp_path / "agents" / "trading"
    agent_dir.mkdir(parents=True)
    sw = SkillWriter(agent_dir)
    sw.write("# Trading Knowledge\n\nContent here.", agent_id="trading")
    skill_file = agent_dir / "SKILL.md"
    assert skill_file.exists()
    assert "Trading Knowledge" in skill_file.read_text()

def test_registry_update(tmp_path):
    reg = Registry(tmp_path / "registry.json")
    reg.register("trading", tmp_path / "agents" / "trading" / "SKILL.md", "accumulate")
    reg.save()

    reg2 = Registry(tmp_path / "registry.json")
    assert "trading" in reg2.agents
    assert reg2.agents["trading"]["mode"] == "accumulate"
```

**Step 2: Run to confirm failure**

```bash
pytest tests/test_skill_writer.py -v
```

**Step 3: Implement `core/skill_writer.py`**

```python
import pathlib


class SkillWriter:
    def __init__(self, agent_dir: pathlib.Path):
        self._agent_dir = agent_dir

    def write(self, skill_content: str, agent_id: str) -> pathlib.Path:
        dest = self._agent_dir / "SKILL.md"
        dest.write_text(skill_content, encoding="utf-8")

        # Also copy to Claude skills directory
        claude_skills = pathlib.Path.home() / ".claude" / "plugins" / "cache" / "cloracle" / agent_id
        claude_skills.mkdir(parents=True, exist_ok=True)
        (claude_skills / "SKILL.md").write_text(skill_content, encoding="utf-8")

        return dest
```

**Step 4: Implement `core/registry.py`**

```python
import json
import pathlib
from datetime import datetime, timezone


class Registry:
    def __init__(self, registry_path: pathlib.Path):
        self._path = registry_path
        self._data = self._load()

    def _load(self) -> dict:
        if self._path.exists():
            return json.loads(self._path.read_text(encoding="utf-8"))
        return {"agents": {}}

    @property
    def agents(self) -> dict:
        return self._data["agents"]

    def register(self, agent_id: str, skill_path: pathlib.Path, mode: str) -> None:
        self._data["agents"][agent_id] = {
            "skill_path": str(skill_path),
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "mode": mode,
        }

    def save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._data, indent=2), encoding="utf-8")
```

**Step 5: Run tests**

```bash
pytest tests/test_skill_writer.py -v
```
Expected: 2 PASSED

**Step 6: Commit**

```bash
git add core/skill_writer.py core/registry.py tests/test_skill_writer.py
git commit -m "feat: add skill writer and registry"
```

---

## Task 10: Collection Pipeline (heartbeat integration)

**Files:**
- Create: `core/pipeline.py`
- Create: `tests/test_pipeline.py`

**Step 1: Write failing tests**

```python
# tests/test_pipeline.py
import pathlib
from unittest.mock import MagicMock
from core.pipeline import CollectionPipeline
from core.models.types import AgentConfig, AnalysisResult

def _make_config():
    return AgentConfig(
        agent_id="test-agent",
        mode="accumulate",
        model="gemini",
        analysis_mode="full_video",
        sources={"youtube_channels": [{"handle": "@TestChan", "check_schedule": "0 8 * * *"}]},
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365},
    )

def _make_analysis_result():
    return AnalysisResult(
        video_id="vid-new",
        video_title="New Video",
        insights=["insight"],
        relevance_score=0.9,
        suggested_action="new_concept",
        suggested_target="new-concept",
        raw_summary="summary",
    )

def test_run_collection_processes_new_videos(tmp_path, mocker):
    mocker.patch("core.pipeline.get_new_videos", return_value=[
        {"id": "vid-new", "title": "New Video", "webpage_url": "https://yt.com/watch?v=vid-new"}
    ])
    mock_provider = MagicMock()
    mock_provider.analyze_video.return_value = _make_analysis_result()

    pipeline = CollectionPipeline(tmp_path, _make_config(), mock_provider, soul="soul text")
    pipeline.run_collection("@TestChan")

    inbox = (tmp_path / "INBOX.md").read_text()
    assert "vid-new" in inbox
    mock_provider.analyze_video.assert_called_once()

def test_run_collection_skips_processed_videos(tmp_path, mocker):
    mocker.patch("core.pipeline.get_new_videos", return_value=[])
    mock_provider = MagicMock()

    pipeline = CollectionPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
    pipeline.run_collection("@TestChan")

    assert not (tmp_path / "INBOX.md").exists()
    mock_provider.analyze_video.assert_not_called()
```

**Step 2: Run to confirm failure**

```bash
pytest tests/test_pipeline.py -v
```

**Step 3: Implement `core/pipeline.py`**

```python
import pathlib
import logging
from core.collector import get_new_videos, fetch_transcript
from core.state import AgentState
from core.inbox import InboxWriter
from core.knowledge import KnowledgeWriter
from core.models.types import AgentConfig

logger = logging.getLogger(__name__)


class CollectionPipeline:
    def __init__(self, agent_dir: pathlib.Path, config: AgentConfig, provider, soul: str):
        self._dir = agent_dir
        self._config = config
        self._provider = provider
        self._soul = soul
        self._state = AgentState(agent_dir)
        self._inbox = InboxWriter(agent_dir)

    def run_collection(self, channel_handle: str) -> None:
        new_videos = get_new_videos(channel_handle, self._state.processed_ids)
        if not new_videos:
            logger.info(f"No new videos from {channel_handle}")
            return

        for video in new_videos:
            vid_id = video["id"]
            vid_title = video.get("title", "")
            vid_url = video.get("webpage_url", f"https://www.youtube.com/watch?v={vid_id}")

            try:
                if self._config.analysis_mode == "full_video" and self._config.model == "gemini":
                    result = self._provider.analyze_video(
                        vid_id, vid_title, vid_url, self._soul,
                        "Extract key insights relevant to this agent's domain."
                    )
                else:
                    transcript = fetch_transcript(vid_id)
                    result = self._provider.analyze_transcript(
                        vid_id, vid_title, transcript, self._soul,
                        "Extract key insights relevant to this agent's domain."
                    )

                self._inbox.append(channel_handle, result)
                self._state.mark_processed(vid_id)
                logger.info(f"Processed {vid_id} (relevance: {result.relevance_score})")
            except Exception as e:
                logger.error(f"Failed to process {vid_id}: {e}")

        self._state.save()
```

**Step 4: Run tests**

```bash
pytest tests/test_pipeline.py -v
```
Expected: 2 PASSED

**Step 5: Commit**

```bash
git add core/pipeline.py tests/test_pipeline.py
git commit -m "feat: add collection pipeline"
```

---

## Task 11: Consolidation Pipeline

**Files:**
- Create: `core/consolidation.py`
- Create: `tests/test_consolidation.py`

**Step 1: Write failing tests**

```python
# tests/test_consolidation.py
import pathlib
from unittest.mock import MagicMock
from core.consolidation import ConsolidationPipeline
from core.models.types import AgentConfig, ConsolidationResult

def _make_config():
    return AgentConfig(
        agent_id="test-agent", mode="accumulate", model="gemini",
        analysis_mode="full_video",
        sources={"youtube_channels": []},
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365},
    )

def test_consolidation_runs_when_inbox_has_items(tmp_path, mocker):
    (tmp_path / "INBOX.md").write_text("## entry\ncontent")
    (tmp_path / "knowledge").mkdir()
    (tmp_path / "knowledge" / "_index.md").write_text("# Index")

    mock_provider = MagicMock()
    mock_provider.consolidate.return_value = ConsolidationResult(
        updated_files=[], created_files=[]
    )
    mock_provider.generate_briefing.return_value = "# Briefing\nContent."
    mock_provider.generate_skill.return_value = "---\nname: test\n---\n# Skill"

    pipeline = ConsolidationPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
    pipeline.run()

    assert (tmp_path / "briefing.md").exists()
    mock_provider.generate_briefing.assert_called_once()

def test_consolidation_skips_when_inbox_empty(tmp_path):
    mock_provider = MagicMock()
    config = _make_config()
    pipeline = ConsolidationPipeline(tmp_path, config, mock_provider, soul="soul")
    pipeline.run()
    mock_provider.generate_briefing.assert_not_called()
```

**Step 2: Run to confirm failure**

```bash
pytest tests/test_consolidation.py -v
```

**Step 3: Implement `core/consolidation.py`**

```python
import pathlib
import logging
from core.inbox import InboxWriter
from core.knowledge import KnowledgeWriter
from core.skill_writer import SkillWriter
from core.state import AgentState
from core.models.types import AgentConfig

logger = logging.getLogger(__name__)


class ConsolidationPipeline:
    def __init__(self, agent_dir: pathlib.Path, config: AgentConfig, provider, soul: str):
        self._dir = agent_dir
        self._config = config
        self._provider = provider
        self._soul = soul

    def run(self) -> None:
        inbox = InboxWriter(self._dir)
        items = inbox.read_items()
        if not items:
            logger.info("Inbox empty, skipping consolidation.")
            return

        logger.info(f"Consolidating {len(items)} inbox items.")
        index_path = self._dir / "knowledge" / "_index.md"
        existing_index = index_path.read_text(encoding="utf-8") if index_path.exists() else ""

        self._provider.consolidate(items, existing_index, self._soul)

        kw = KnowledgeWriter(self._dir, self._config.decay.get("half_life_days", 365))
        knowledge_files = kw.load_all_weighted()

        briefing = self._provider.generate_briefing(knowledge_files, self._soul, self._config.mode)
        (self._dir / "briefing.md").write_text(briefing, encoding="utf-8")

        skill_content = self._provider.generate_skill(briefing, self._soul, self._config.agent_id)
        sw = SkillWriter(self._dir)
        sw.write(skill_content, self._config.agent_id)

        self._update_index(knowledge_files)
        inbox.clear()

        state = AgentState(self._dir)
        state.update_last_consolidation()
        state.save()
        logger.info("Consolidation complete.")

    def _update_index(self, files: list[dict]) -> None:
        lines = ["# Knowledge Index\n"]
        for f in files[:20]:
            lines.append(f"- `{f['path']}` — weight: {f['effective_weight']:.3f}")
        index_path = self._dir / "knowledge" / "_index.md"
        index_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.write_text("\n".join(lines), encoding="utf-8")
```

**Step 4: Run tests**

```bash
pytest tests/test_consolidation.py -v
```
Expected: 2 PASSED

**Step 5: Commit**

```bash
git add core/consolidation.py tests/test_consolidation.py
git commit -m "feat: add consolidation pipeline"
```

---

## Task 12: Scheduler + Agent Loader

**Files:**
- Create: `core/scheduler.py`
- Create: `core/agent_loader.py`
- Create: `tests/test_agent_loader.py`

**Step 1: Write failing test**

```python
# tests/test_agent_loader.py
import pathlib
from core.agent_loader import load_agent

def test_load_agent_from_directory(tmp_path):
    agent_dir = tmp_path / "trading-price-action"
    agent_dir.mkdir()
    (agent_dir / "SOUL.md").write_text("# Soul\n## Mission\nTrade well.")
    config_yaml = """
agent_id: trading-price-action
mode: accumulate
model: gemini
analysis_mode: full_video
sources:
  youtube_channels:
    - handle: "@TestChan"
      check_schedule: "0 8 * * *"
consolidation_schedule: "0 3 * * 0"
decay:
  half_life_days: 365
"""
    (agent_dir / "config.yaml").write_text(config_yaml)

    agent = load_agent(agent_dir, gemini_api_key="fake-key")
    assert agent["config"].agent_id == "trading-price-action"
    assert "Trade well" in agent["soul"]
```

**Step 2: Run to confirm failure**

```bash
pytest tests/test_agent_loader.py -v
```

**Step 3: Implement `core/agent_loader.py`**

```python
import pathlib
from core.config import load_agent_config, load_soul
from core.models.gemini import GeminiProvider
from core.pipeline import CollectionPipeline
from core.consolidation import ConsolidationPipeline


def load_agent(agent_dir: pathlib.Path, gemini_api_key: str) -> dict:
    config = load_agent_config(agent_dir / "config.yaml")
    soul = load_soul(agent_dir)

    if config.model == "gemini":
        provider = GeminiProvider(api_key=gemini_api_key)
    else:
        raise ValueError(f"Unsupported model: {config.model}")

    return {
        "config": config,
        "soul": soul,
        "provider": provider,
        "dir": agent_dir,
        "collection": CollectionPipeline(agent_dir, config, provider, soul),
        "consolidation": ConsolidationPipeline(agent_dir, config, provider, soul),
    }
```

**Step 4: Implement `core/scheduler.py`**

```python
import pathlib
import logging
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


def build_scheduler(agents: list[dict]) -> BlockingScheduler:
    scheduler = BlockingScheduler()

    for agent in agents:
        config = agent["config"]
        collection_pipeline = agent["collection"]
        consolidation_pipeline = agent["consolidation"]

        for channel in config.sources.get("youtube_channels", []):
            handle = channel["handle"]
            cron = channel.get("check_schedule", "0 8 * * *")
            parts = cron.split()
            trigger = CronTrigger(
                minute=parts[0], hour=parts[1],
                day=parts[2], month=parts[3], day_of_week=parts[4]
            )
            scheduler.add_job(
                collection_pipeline.run_collection,
                trigger=trigger,
                args=[handle],
                id=f"{config.agent_id}_{handle}_collect",
                name=f"Collect {handle} for {config.agent_id}",
            )
            logger.info(f"Scheduled collection: {config.agent_id} / {handle} @ {cron}")

        cron = config.consolidation_schedule
        parts = cron.split()
        scheduler.add_job(
            consolidation_pipeline.run,
            trigger=CronTrigger(
                minute=parts[0], hour=parts[1],
                day=parts[2], month=parts[3], day_of_week=parts[4]
            ),
            id=f"{config.agent_id}_consolidate",
            name=f"Consolidate {config.agent_id}",
        )
        logger.info(f"Scheduled consolidation: {config.agent_id} @ {cron}")

    return scheduler
```

**Step 5: Run tests**

```bash
pytest tests/test_agent_loader.py -v
```
Expected: 1 PASSED

**Step 6: Commit**

```bash
git add core/scheduler.py core/agent_loader.py tests/test_agent_loader.py
git commit -m "feat: add scheduler and agent loader"
```

---

## Task 13: Main Entry Point + Example Agent

**Files:**
- Create: `main.py`
- Create: `~/.cloracle/agents/trading-price-action/SOUL.md`
- Create: `~/.cloracle/agents/trading-price-action/config.yaml`
- Create: `.env.example`

**Step 1: Create `main.py`**

```python
import os
import pathlib
import logging
from core.agent_loader import load_agent
from core.scheduler import build_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

WORKSPACE = pathlib.Path.home() / ".cloracle"
AGENTS_DIR = WORKSPACE / "agents"


def main():
    gemini_api_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable not set.")

    agents = []
    for agent_dir in sorted(AGENTS_DIR.iterdir()):
        if not agent_dir.is_dir():
            continue
        if not (agent_dir / "config.yaml").exists():
            continue
        logger.info(f"Loading agent: {agent_dir.name}")
        agents.append(load_agent(agent_dir, gemini_api_key=gemini_api_key))

    if not agents:
        logger.warning(f"No agents found in {AGENTS_DIR}. Create an agent directory with SOUL.md and config.yaml.")
        return

    logger.info(f"Loaded {len(agents)} agent(s). Starting scheduler.")
    scheduler = build_scheduler(agents)
    scheduler.start()


if __name__ == "__main__":
    main()
```

**Step 2: Create `.env.example`**

```
GEMINI_API_KEY=your-gemini-api-key-here
```

**Step 3: Create example agent files**

Create `~/.cloracle/agents/trading-price-action/SOUL.md`:
```markdown
# Trading Price Action Knowledge Agent

## Mission
I accumulate and maintain deep knowledge about price action-based trading strategies.
My primary goal is to build a structured knowledge base for trading bot implementation agents.

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

Create `~/.cloracle/agents/trading-price-action/config.yaml`:
```yaml
agent_id: trading-price-action
mode: accumulate
model: gemini
analysis_mode: full_video

sources:
  youtube_channels:
    - handle: "@SMBCapital"
      check_schedule: "0 8 * * *"

consolidation_schedule: "0 3 * * 0"

decay:
  half_life_days: 365
```

**Step 4: Run full test suite**

```bash
pytest tests/ -v
```
Expected: All tests PASSED

**Step 5: Smoke-test startup (Ctrl+C to stop)**

```bash
GEMINI_API_KEY=dummy python main.py
```
Expected: Logs show agent loaded and scheduler jobs registered. No crash.

**Step 6: Final commit**

```bash
git add main.py .env.example
git commit -m "feat: add main entry point and example agent templates"
```

---

## Task 14: Create ai-developments Watch Agent Example

**Files:**
- Create: `~/.cloracle/agents/ai-developments/SOUL.md`
- Create: `~/.cloracle/agents/ai-developments/config.yaml`

**Step 1: Create `~/.cloracle/agents/ai-developments/SOUL.md`**

```markdown
# AI Developments Watch Agent

## Mission
I monitor the latest developments in Artificial Intelligence and Large Language Models.
I keep track of new research, tools, frameworks, and industry news.

## Domain
Artificial Intelligence, Large Language Models, AI Research, AI Products, AI Business

## Output Goal
- Type: awareness + opportunity
- Target: Daniel (the user) + project ideation agents
- Key focus: New capabilities, emerging tools, business opportunities, research breakthroughs

## Mode
watch

## Knowledge Priorities
1. New model releases and capability improvements
2. New open-source tools and frameworks
3. Industry trends and business opportunities
4. Research papers with practical implications
5. Proactive project/business ideas based on trends
```

**Step 2: Create `~/.cloracle/agents/ai-developments/config.yaml`**

```yaml
agent_id: ai-developments
mode: watch
model: gemini
analysis_mode: full_video

sources:
  youtube_channels:
    - handle: "@YannicKilcher"
      check_schedule: "0 9 * * *"
    - handle: "@AndrejKarpathy"
      check_schedule: "0 9 * * *"

consolidation_schedule: "0 4 * * 1"   # Monday 04:00

decay:
  half_life_days: 30
```

**Step 3: Commit**

```bash
git add .
git commit -m "docs: add ai-developments watch agent example"
```

---

## Full Test Run

```bash
pytest tests/ -v --tb=short
```

All tests should pass. Final structure:

```
cloracle/
  core/
    __init__.py
    agent_loader.py
    collector.py
    config.py
    consolidation.py
    inbox.py
    knowledge.py
    pipeline.py
    registry.py
    scheduler.py
    skill_writer.py
    state.py
    models/
      __init__.py
      base.py
      gemini.py
      types.py
  tests/
    __init__.py
    fixtures/
      __init__.py
      trading-agent-config.yaml
    test_agent_loader.py
    test_collector.py
    test_config.py
    test_consolidation.py
    test_gemini_provider.py
    test_inbox.py
    test_knowledge.py
    test_pipeline.py
    test_skill_writer.py
    test_state.py
    test_types.py
  docs/
    plans/
      2026-02-25-knowledge-agent-design.md
      2026-02-25-cloracle-implementation.md
  main.py
  requirements.txt
  pyproject.toml
  .env.example
```
