# Reevaluate Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Reevaluate Now" button that re-scores all knowledge files against the current SOUL.md (batch LLM call), then regenerates briefing.md and SKILL.md — skipping YouTube extraction entirely.

**Architecture:** New `reevaluate_knowledge()` method on `GeminiProvider` does a single batch LLM call returning `{path: score}`. New `update_relevance_score()` on `KnowledgeWriter` patches each file's frontmatter on disk. New `run_reevaluation()` on `ConsolidationPipeline` orchestrates the whole flow. A new API endpoint and React hook mirror the existing consolidation trigger pattern.

**Tech Stack:** Python `python-frontmatter`, APScheduler, FastAPI, React/TanStack Query, Tailwind CSS

---

### Task 1: Add `GeminiProvider.reevaluate_knowledge()`

**Files:**
- Modify: `core/models/gemini.py`
- Test: `tests/test_gemini_provider.py`

**Step 1: Write the failing test**

Add to `tests/test_gemini_provider.py`:

```python
def test_reevaluate_knowledge_returns_score_dict(mocker):
    mock_client = _make_mock_client(
        '{"scores": [{"path": "concepts/topic.md", "score": 0.7}]}'
    )
    mocker.patch("core.models.gemini.genai.Client", return_value=mock_client)

    provider = GeminiProvider(api_key="fake-key")
    files = [{"path": "concepts/topic.md", "content": "Some knowledge content."}]
    result = provider.reevaluate_knowledge(files, SOUL)

    assert result == {"concepts/topic.md": 0.7}
    mock_client.models.generate_content.assert_called_once()
```

**Step 2: Run to verify it fails**

```
uv run pytest tests/test_gemini_provider.py::test_reevaluate_knowledge_returns_score_dict -v
```
Expected: FAIL — `AttributeError: 'GeminiProvider' object has no attribute 'reevaluate_knowledge'`

**Step 3: Implement in `core/models/gemini.py`**

Add this constant near the top of the file (after `_ANALYSIS_SCHEMA`):

```python
_REEVALUATE_SCHEMA = """
Respond with valid JSON only, no markdown fences:
{"scores": [{"path": "<relative_path>", "score": <0.0-1.0>}, ...]}
"""
```

Add this method to `GeminiProvider` (after `consolidate`):

```python
def reevaluate_knowledge(self, files: list[dict], soul: str) -> dict[str, float]:
    files_text = "\n\n".join(
        f"--- {f['path']} ---\n{f['content']}" for f in files
    )
    contents = (
        f"AGENT SOUL:\n{soul}\n\n"
        f"TASK: Re-score each knowledge file below. Assign a relevance_score from 0.0 "
        f"(completely irrelevant to the soul's interests) to 1.0 (directly core to them).\n\n"
        f"{_REEVALUATE_SCHEMA}\n\n"
        f"KNOWLEDGE FILES:\n{files_text}"
    )
    data = self._parse_result(self._generate(contents, model=self._consolidation_model_name))
    return {item["path"]: float(item["score"]) for item in data.get("scores", [])}
```

**Step 4: Run to verify it passes**

```
uv run pytest tests/test_gemini_provider.py::test_reevaluate_knowledge_returns_score_dict -v
```
Expected: PASS

**Step 5: Run full test suite to check for regressions**

```
uv run pytest tests/test_gemini_provider.py -v
```
Expected: All PASS

**Step 6: Commit**

```bash
git add core/models/gemini.py tests/test_gemini_provider.py
git commit -m "feat: add GeminiProvider.reevaluate_knowledge() batch scoring method"
```

---

### Task 2: Add `KnowledgeWriter.update_relevance_score()`

**Files:**
- Modify: `core/knowledge.py`
- Test: `tests/test_knowledge.py`

**Step 1: Read the existing knowledge test to understand fixture patterns**

Run: `cat tests/test_knowledge.py` — note how `tmp_path` and `frontmatter` are used.

**Step 2: Write the failing test**

Add to `tests/test_knowledge.py`:

```python
def test_update_relevance_score_patches_frontmatter(tmp_path):
    import frontmatter as fm
    kw = KnowledgeWriter(tmp_path, half_life_days=365)
    # Write a concept file first
    kw.write_concept("my-topic", "Original content about trading.")
    # Now re-score it
    kw.update_relevance_score("concepts/my-topic.md", 0.42)
    # Reload and check
    post = fm.load(str(tmp_path / "knowledge" / "concepts" / "my-topic.md"))
    assert post["relevance_score"] == 0.42
    assert post.content == "Original content about trading."  # content unchanged
```

**Step 3: Run to verify it fails**

```
uv run pytest tests/test_knowledge.py::test_update_relevance_score_patches_frontmatter -v
```
Expected: FAIL — `AttributeError: 'KnowledgeWriter' object has no attribute 'update_relevance_score'`

**Step 4: Implement in `core/knowledge.py`**

Add this method to `KnowledgeWriter` (after `write_recent`):

```python
def update_relevance_score(self, relative_path: str, score: float) -> None:
    dest = self._base / relative_path
    if not dest.exists():
        return
    post = frontmatter.load(str(dest))
    post["relevance_score"] = score
    dest.write_text(frontmatter.dumps(post), encoding="utf-8")
```

**Step 5: Run to verify it passes**

```
uv run pytest tests/test_knowledge.py::test_update_relevance_score_patches_frontmatter -v
```
Expected: PASS

**Step 6: Run full knowledge tests**

```
uv run pytest tests/test_knowledge.py -v
```
Expected: All PASS

**Step 7: Commit**

```bash
git add core/knowledge.py tests/test_knowledge.py
git commit -m "feat: add KnowledgeWriter.update_relevance_score() frontmatter patcher"
```

---

### Task 3: Add `ConsolidationPipeline.run_reevaluation()`

**Files:**
- Modify: `core/consolidation.py`
- Test: `tests/test_consolidation.py`

**Step 1: Write the failing tests**

Add to `tests/test_consolidation.py`:

```python
def test_reevaluation_skips_when_no_knowledge_files(tmp_path):
    mock_provider = MagicMock()
    pipeline = ConsolidationPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
    pipeline.run_reevaluation()
    mock_provider.reevaluate_knowledge.assert_not_called()
    mock_provider.generate_briefing.assert_not_called()


def test_reevaluation_scores_files_and_generates_outputs(tmp_path):
    import frontmatter as fm
    # Create a knowledge file
    concepts_dir = tmp_path / "knowledge" / "concepts"
    concepts_dir.mkdir(parents=True)
    post = fm.Post("Some content.", relevance_score=1.0, created="2026-01-01",
                   updated="2026-01-01", decay_half_life=365, sources=[], tags=[])
    (concepts_dir / "topic.md").write_text(fm.dumps(post), encoding="utf-8")

    mock_provider = MagicMock()
    mock_provider.reevaluate_knowledge.return_value = {"concepts/topic.md": 0.3}
    mock_provider.generate_briefing.return_value = "# Briefing\nContent."
    mock_provider.generate_skill.return_value = "---\nname: test\n---\n# Skill"

    with patch("core.consolidation.SkillWriter") as MockSW, \
         patch("core.consolidation.Registry"):
        MockSW.return_value.write.return_value = tmp_path / "SKILL.md"
        pipeline = ConsolidationPipeline(tmp_path, _make_config(), mock_provider, soul="soul")
        pipeline.run_reevaluation()

    # Score was updated on disk
    reloaded = fm.load(str(concepts_dir / "topic.md"))
    assert reloaded["relevance_score"] == 0.3
    # Outputs were generated
    assert (tmp_path / "briefing.md").exists()
    mock_provider.reevaluate_knowledge.assert_called_once()
    mock_provider.generate_briefing.assert_called_once()
    mock_provider.generate_skill.assert_called_once()
```

**Step 2: Run to verify they fail**

```
uv run pytest tests/test_consolidation.py::test_reevaluation_skips_when_no_knowledge_files tests/test_consolidation.py::test_reevaluation_scores_files_and_generates_outputs -v
```
Expected: FAIL — `AttributeError: 'ConsolidationPipeline' object has no attribute 'run_reevaluation'`

**Step 3: Implement `run_reevaluation()` in `core/consolidation.py`**

Add this method to `ConsolidationPipeline` (after `run`):

```python
def run_reevaluation(self) -> None:
    agent_id = self._config.agent_id
    task = "reevaluation"
    job_status.start(agent_id, task, "Loading knowledge files...")

    try:
        kw = KnowledgeWriter(self._dir, self._config.decay.get("half_life_days", 365))
        files = kw.load_all_weighted()
        if not files:
            logger.info("No knowledge files found, skipping reevaluation.")
            job_status.complete(agent_id, task)
            return

        job_status.update_step(agent_id, task, f"Re-scoring {len(files)} knowledge files against SOUL...")
        scores = self._provider.reevaluate_knowledge(files, self._soul)

        job_status.update_step(agent_id, task, "Updating knowledge file scores...")
        for path, score in scores.items():
            kw.update_relevance_score(path, score)

        knowledge_files = kw.load_all_weighted()

        job_status.update_step(agent_id, task, "Generating briefing.md...")
        briefing = self._provider.generate_briefing(knowledge_files, self._soul, self._config.mode)
        (self._dir / "briefing.md").write_text(briefing, encoding="utf-8")

        job_status.update_step(agent_id, task, "Generating SKILL.md...")
        skill_content = self._provider.generate_skill(briefing, self._soul, self._config.agent_id)
        sw = SkillWriter(self._dir)
        sw.write(skill_content, self._config.agent_id)

        reg = Registry(pathlib.Path.home() / ".cloracle" / "registry.json")
        reg.register(self._config.agent_id, self._dir / "SKILL.md", self._config.mode)
        reg.save()

        self._update_index(knowledge_files)

        state = AgentState(self._dir)
        state.update_last_consolidation()
        state.save()
        logger.info("Reevaluation complete.")
        job_status.complete(agent_id, task)

    except Exception as e:
        logger.error(f"Reevaluation failed: {e}")
        job_status.fail(agent_id, task, str(e))
        raise
```

**Step 4: Run to verify they pass**

```
uv run pytest tests/test_consolidation.py::test_reevaluation_skips_when_no_knowledge_files tests/test_consolidation.py::test_reevaluation_scores_files_and_generates_outputs -v
```
Expected: Both PASS

**Step 5: Run full consolidation and knowledge tests**

```
uv run pytest tests/test_consolidation.py tests/test_knowledge.py tests/test_gemini_provider.py -v
```
Expected: All PASS

**Step 6: Commit**

```bash
git add core/consolidation.py tests/test_consolidation.py
git commit -m "feat: add ConsolidationPipeline.run_reevaluation() — re-scores knowledge files against current SOUL"
```

---

### Task 4: Add API endpoint `POST /api/scheduler/trigger/{agent_id}/reevaluate`

**Files:**
- Modify: `api/routers/scheduler.py`

**Step 1: Add the endpoint**

In `api/routers/scheduler.py`, add after `trigger_consolidation`:

```python
@router.post("/trigger/{agent_id}/reevaluate")
def trigger_reevaluation(agent_id: str, request: Request):
    agents = request.app.state.agents
    if agent_id not in agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = agents[agent_id]
    pipeline = agent["consolidation"]
    scheduler = get_scheduler()

    scheduler.add_job(
        pipeline.run_reevaluation,
        trigger="date",
        run_date=datetime.now(timezone.utc),
        id=f"{agent_id}_manual_reevaluate_{datetime.now(timezone.utc).timestamp():.0f}",
        name=f"Manual reevaluate {agent_id}",
    )
    logger.info(f"Triggered reevaluation: {agent_id}")
    return {"status": "triggered", "agent_id": agent_id}
```

**Step 2: Verify server starts without errors**

```
uv run python -c "from api.app import create_app; app = create_app(); print('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add api/routers/scheduler.py
git commit -m "feat: add POST /api/scheduler/trigger/{agent_id}/reevaluate endpoint"
```

---

### Task 5: Add `useTriggerReevaluation` hook

**Files:**
- Modify: `web/src/api/scheduler.ts`

**Step 1: Add the hook**

In `web/src/api/scheduler.ts`, add after `useTriggerConsolidation`:

```typescript
export function useTriggerReevaluation(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/scheduler/trigger/${agentId}/reevaluate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}
```

**Step 2: Verify TypeScript compiles**

```
cd web && npm run build 2>&1 | tail -5
```
Expected: No TypeScript errors (build succeeds or only pre-existing warnings)

**Step 3: Commit**

```bash
git add web/src/api/scheduler.ts
git commit -m "feat: add useTriggerReevaluation hook"
```

---

### Task 6: Add "Reevaluate Now" button in `StatusPanel.tsx`

**Files:**
- Modify: `web/src/components/StatusPanel.tsx`

**Step 1: Update the import line**

Change line 2 from:
```typescript
import { useTriggerCollection, useTriggerConsolidation } from '../api/scheduler';
```
to:
```typescript
import { useTriggerCollection, useTriggerConsolidation, useTriggerReevaluation } from '../api/scheduler';
```

**Step 2: Add the hook and handler**

After `const triggerConsolidation = useTriggerConsolidation(agent.agent_id);` add:
```typescript
const triggerReevaluation = useTriggerReevaluation(agent.agent_id);
```

After the `handleConsolidate` function, add:
```typescript
const handleReevaluate = async () => {
  setMessage('');
  try {
    await triggerReevaluation.mutateAsync();
    setMessage('Triggered reevaluation');
  } catch (err) {
    setMessage(`Error: ${(err as Error).message}`);
  }
};
```

**Step 3: Add the button**

After the existing "Run Consolidation Now" `<button>`, add:
```tsx
<button
  onClick={handleReevaluate}
  disabled={triggerReevaluation.isPending}
  className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded text-sm font-medium transition-colors"
>
  {triggerReevaluation.isPending ? 'Triggering...' : 'Reevaluate Now'}
</button>
```

Note: Use `bg-violet-700` to visually distinguish it from the indigo consolidation button — both are in the same `<div>` so wrap them in a flex container if needed:

Replace the entire `<div>` that wraps the consolidation button (currently lines 94–102) with:
```tsx
<div className="flex gap-3">
  <button
    onClick={handleConsolidate}
    disabled={triggerConsolidation.isPending}
    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
  >
    {triggerConsolidation.isPending ? 'Triggering...' : 'Run Consolidation Now'}
  </button>
  <button
    onClick={handleReevaluate}
    disabled={triggerReevaluation.isPending}
    className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded text-sm font-medium transition-colors"
  >
    {triggerReevaluation.isPending ? 'Triggering...' : 'Reevaluate Now'}
  </button>
</div>
```

**Step 4: Verify TypeScript compiles**

```
cd web && npm run build 2>&1 | tail -5
```
Expected: No TypeScript errors

**Step 5: Run full Python test suite one final time**

```
uv run pytest -v
```
Expected: All PASS

**Step 6: Commit**

```bash
git add web/src/components/StatusPanel.tsx
git commit -m "feat: add Reevaluate Now button to StatusPanel"
```
