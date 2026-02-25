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
