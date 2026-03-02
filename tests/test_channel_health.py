import pathlib
import pytest
from unittest.mock import MagicMock, patch
from datetime import date

import frontmatter

from core.state import AgentState
from core.knowledge import KnowledgeWriter
from core.pipeline import CollectionPipeline
from core.models.types import AgentConfig, CredibilitySignals


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_config(agent_id="test-agent"):
    return AgentConfig(
        agent_id=agent_id,
        model="gemini",
        analysis_mode="transcript_only",
        sources={"youtube_channels": [{"handle": "@TestChannel"}]},
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365},
        self_improving=True,
    )


def make_state(tmp_path: pathlib.Path) -> AgentState:
    return AgentState(tmp_path)


# ---------------------------------------------------------------------------
# AgentState — source_stats
# ---------------------------------------------------------------------------

def test_record_source_score_appends(tmp_path):
    state = make_state(tmp_path)
    state.record_source_score("@A", 0.8)
    state.record_source_score("@A", 0.6)
    assert state.get_source_stats("@A")["scores"] == [0.8, 0.6]


def test_record_source_score_rolling_window(tmp_path):
    state = make_state(tmp_path)
    for i in range(25):
        state.record_source_score("@A", float(i) / 25)
    scores = state.get_source_stats("@A")["scores"]
    assert len(scores) == 20
    # Should keep the last 20
    assert scores[-1] == pytest.approx(24 / 25)


def test_recompute_agent_average_single_source(tmp_path):
    state = make_state(tmp_path)
    state.record_source_score("@A", 0.8)
    state.record_source_score("@A", 0.6)
    state.recompute_agent_average()
    assert state._data["agent_score_average"] == pytest.approx(0.7)


def test_recompute_agent_average_multiple_sources(tmp_path):
    state = make_state(tmp_path)
    for s in [0.8, 0.6]:  # @A avg = 0.7
        state.record_source_score("@A", s)
    for s in [0.4, 0.2]:  # @B avg = 0.3
        state.record_source_score("@B", s)
    state.recompute_agent_average()
    assert state._data["agent_score_average"] == pytest.approx(0.5)


def test_recompute_agent_average_empty(tmp_path):
    state = make_state(tmp_path)
    state.recompute_agent_average()
    assert state._data["agent_score_average"] == 0.0


def test_record_credibility_flag_increments(tmp_path):
    state = make_state(tmp_path)
    signals = CredibilitySignals(hype_pattern=True, unverified_claims=False, hype_phrases=["amazing gains"])
    state.record_source_credibility_flag("@A", signals)
    state.record_source_credibility_flag("@A", signals)
    flags = state.get_source_stats("@A")["credibility_flags"]
    assert flags["hype_pattern"] == 2
    assert flags["unverified_claims"] == 0


def test_set_source_status_pauses(tmp_path):
    state = make_state(tmp_path)
    state.set_source_status("@A", "paused", "low_scores")
    s = state.get_source_stats("@A")
    assert s["status"] == "paused"
    assert s["flagged_reason"] == "low_scores"
    assert s["flagged_at"] is not None


def test_set_source_status_reset_clears_reason(tmp_path):
    state = make_state(tmp_path)
    state.set_source_status("@A", "paused", "low_scores")
    state.set_source_status("@A", "active", None)
    s = state.get_source_stats("@A")
    assert s["status"] == "active"
    assert s["flagged_reason"] is None
    assert s["flagged_at"] is None


def test_state_round_trips_source_stats(tmp_path):
    state = make_state(tmp_path)
    state.record_source_score("@A", 0.9)
    state.set_source_status("@A", "flagged", "hype_pattern")
    state.save()

    state2 = AgentState(tmp_path)
    s = state2.get_source_stats("@A")
    assert s["scores"] == [0.9]
    assert s["status"] == "flagged"


# ---------------------------------------------------------------------------
# CollectionPipeline._check_source_health
# ---------------------------------------------------------------------------

def _make_pipeline(tmp_path, provider=None):
    config = make_config()
    provider = provider or MagicMock()
    return CollectionPipeline(tmp_path, config, provider, "soul text")


def _seed_source_scores(state: AgentState, source_id: str, scores: list[float]):
    for s in scores:
        state.record_source_score(source_id, s)


def test_check_source_health_pauses_low_scoring_source(tmp_path):
    pipeline = _make_pipeline(tmp_path)
    state = make_state(tmp_path)

    # Agent has two sources: @Good (high scores) and @Bad (low scores)
    _seed_source_scores(state, "@Good", [0.9, 0.85, 0.88, 0.92, 0.87])   # avg ~0.88
    _seed_source_scores(state, "@Bad",  [0.1, 0.12, 0.08, 0.11, 0.09])   # avg ~0.10

    pipeline._check_source_health(state)

    assert state.get_source_stats("@Bad")["status"] == "paused"
    assert state.get_source_stats("@Good")["status"] == "active"


def test_check_source_health_flags_hype_pattern(tmp_path):
    pipeline = _make_pipeline(tmp_path)
    state = make_state(tmp_path)

    _seed_source_scores(state, "@Hyped", [0.7, 0.7, 0.7, 0.7, 0.7])
    # Manually set credibility flags
    for _ in range(3):
        state.record_source_credibility_flag(
            "@Hyped",
            CredibilitySignals(hype_pattern=True, unverified_claims=False, hype_phrases=[]),
        )

    pipeline._check_source_health(state)

    s = state.get_source_stats("@Hyped")
    assert s["status"] == "flagged"
    assert s["flagged_reason"] == "hype_pattern"


def test_check_source_health_flags_unverified_claims(tmp_path):
    pipeline = _make_pipeline(tmp_path)
    state = make_state(tmp_path)

    _seed_source_scores(state, "@Unverified", [0.6, 0.6, 0.6, 0.6, 0.6])
    for _ in range(3):
        state.record_source_credibility_flag(
            "@Unverified",
            CredibilitySignals(hype_pattern=False, unverified_claims=True, hype_phrases=[]),
        )

    pipeline._check_source_health(state)

    s = state.get_source_stats("@Unverified")
    assert s["status"] == "flagged"
    assert s["flagged_reason"] == "unverified_claims"


def test_check_source_health_skips_with_fewer_than_5_scores(tmp_path):
    pipeline = _make_pipeline(tmp_path)
    state = make_state(tmp_path)

    # Only 4 scores — should not be paused regardless of values
    _seed_source_scores(state, "@Few", [0.0, 0.0, 0.0, 0.0])

    pipeline._check_source_health(state)

    assert state.get_source_stats("@Few")["status"] == "active"


def test_check_source_health_writes_warnings_file(tmp_path):
    pipeline = _make_pipeline(tmp_path)
    state = make_state(tmp_path)

    _seed_source_scores(state, "@Good", [0.9, 0.9, 0.9, 0.9, 0.9])
    _seed_source_scores(state, "@Bad",  [0.1, 0.1, 0.1, 0.1, 0.1])

    pipeline._check_source_health(state)

    warnings_file = tmp_path / "warnings.md"
    assert warnings_file.exists()
    content = warnings_file.read_text(encoding="utf-8")
    assert "@Bad" in content
    assert "paused" in content


# ---------------------------------------------------------------------------
# KnowledgeWriter.prune_low_weight
# ---------------------------------------------------------------------------

def _write_knowledge_file(kw: KnowledgeWriter, name: str, score: float, age_days: int) -> pathlib.Path:
    """Write a concept file with a backdated 'created' date for testing pruning."""
    from datetime import timedelta, date as date_cls
    created = (date_cls.today() - timedelta(days=age_days)).isoformat()
    dest = kw._base / "concepts" / f"{name}.md"
    dest.parent.mkdir(parents=True, exist_ok=True)
    post = frontmatter.Post(
        f"Content of {name}",
        created=created,
        updated=created,
        relevance_score=score,
        effective_weight=score,
        decay_half_life=365,
        sources=[],
        tags=[],
    )
    dest.write_text(frontmatter.dumps(post), encoding="utf-8")
    return dest


def test_prune_low_weight_moves_file_to_archive(tmp_path):
    kw = KnowledgeWriter(tmp_path, half_life_days=365)
    # score=0.1, age=730 days → weight = 0.1 * 0.25 = 0.025 → below 0.1 threshold
    _write_knowledge_file(kw, "old-topic", score=0.1, age_days=730)

    pruned = kw.prune_low_weight(threshold=0.1)

    assert len(pruned) == 1
    assert "old-topic.md" in pruned[0]
    assert not (kw._base / "concepts" / "old-topic.md").exists()
    archived = list((kw._base / "archived").rglob("old-topic.md"))
    assert len(archived) == 1


def test_prune_low_weight_keeps_high_weight_file(tmp_path):
    kw = KnowledgeWriter(tmp_path, half_life_days=365)
    # score=0.9, age=0 days → weight = 0.9 → above threshold
    _write_knowledge_file(kw, "fresh-topic", score=0.9, age_days=0)

    pruned = kw.prune_low_weight(threshold=0.1)

    assert pruned == []
    assert (kw._base / "concepts" / "fresh-topic.md").exists()


def test_prune_low_weight_skips_index(tmp_path):
    kw = KnowledgeWriter(tmp_path, half_life_days=365)
    index = kw._base / "_index.md"
    index.parent.mkdir(parents=True, exist_ok=True)
    index.write_text("# Index", encoding="utf-8")

    pruned = kw.prune_low_weight(threshold=1.0)  # threshold=1.0 would catch everything

    assert all("_index.md" not in p for p in pruned)
    assert index.exists()


def test_prune_low_weight_skips_already_archived(tmp_path):
    kw = KnowledgeWriter(tmp_path, half_life_days=365)
    archived_dir = kw._base / "archived" / "2025-01"
    archived_dir.mkdir(parents=True, exist_ok=True)
    already = archived_dir / "already-archived.md"
    post = frontmatter.Post("old content", created="2024-01-01", relevance_score=0.0)
    already.write_text(frontmatter.dumps(post), encoding="utf-8")

    pruned = kw.prune_low_weight(threshold=1.0)

    assert all("already-archived.md" not in p for p in pruned)
    assert already.exists()


def test_prune_low_weight_empty_knowledge_dir(tmp_path):
    kw = KnowledgeWriter(tmp_path, half_life_days=365)
    # No knowledge/ directory at all
    pruned = kw.prune_low_weight()
    assert pruned == []
