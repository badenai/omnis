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
