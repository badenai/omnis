import math
from datetime import datetime, timezone
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
    weight = kw.compute_effective_weight(relevance_score=1.0, age_days=30)
    assert abs(weight - 0.5) < 0.01


def test_load_all_weighted_sorted(tmp_path):
    kw = KnowledgeWriter(tmp_path, half_life_days=365)
    kw.write_concept("concept-a", "Content A")
    kw.write_concept("concept-b", "Content B")
    files = kw.load_all_weighted()
    assert len(files) == 2
    weights = [f["effective_weight"] for f in files]
    assert weights == sorted(weights, reverse=True)


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


def test_update_relevance_score_missing_file_is_noop(tmp_path):
    kw = KnowledgeWriter(tmp_path, half_life_days=365)
    # Should not raise any exception
    kw.update_relevance_score("concepts/nonexistent.md", 0.5)
