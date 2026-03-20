# Independent Grader for Skill Evaluation

## Problem

The current `evaluate_skill()` loop is self-referential: Gemini generates the skill, answers the test prompts with and without it, and grades its own responses. A model that produces a style it also prefers will score well regardless of whether that style is genuinely more useful. There is no independent judge.

## Goal

Replace the grader call with a different model so the evaluator is decoupled from the generator. The generator stays on Gemini; the grader moves to a second model (e.g. Claude or GPT).

## Where to Change

`core/models/gemini.py` — `evaluate_skill()` method.

The grader is currently the third call inside the per-prompt loop:
```python
# currently: grader uses self._consolidation_model_name (Gemini)
grader_response = self._generate(grader_prompt, model=self._consolidation_model_name)
```

The fix is to route that single call to a different provider. Options:

**Option A — Second model via environment variable**
Add a `grader_model` field to `AgentConfig` (e.g. `"claude"` or `"openai"`). Load a second provider instance in `agent_loader.py`. Pass it into `ConsolidationPipeline` and call `grader_provider._generate(grader_prompt)` for the grader step only.

**Option B — Hardcode a second Gemini model family**
Use a different Gemini model for grading (e.g. `gemini-3-flash` grades while `gemini-3.1-pro` generates). Weaker separation but zero new dependencies.

**Option C — Abstract a `GraderProvider` interface**
`evaluate_skill()` accepts an optional `grader` parameter. If provided, use it for the grader call; otherwise fall back to self. Clean and testable.

Option C is the least invasive — no config schema changes required to get started.

## Key Consideration

The two response calls (with skill / without skill) can stay on Gemini — they just answer the prompt. Only the grader call needs to move to an independent model. This minimises cost impact since grading is one call per prompt vs two answer calls.

## Notes

- Soul autopilot and the Eval Impact UI both call `evaluate_skill()` — they get the independent grader automatically once the fix is in
- The `skill_quality.json` `grader_reasoning` field already stores the grader's explanation; surfaced in the Eval History panel
- Cross-model grading introduces latency variability — the grader model may be slower or require a different API key
