import pathlib
import pytest


def test_micro_consolidation_updates_knowledge(tmp_path, mocker):
    from core.micro_consolidation import MicroConsolidation
    from core.models.types import AgentConfig

    config = AgentConfig(
        agent_id="test",
        model="gemini",
        analysis_mode="transcript_only",
        sources={},
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365},
        reflect_immediately=True,
    )
    provider = mocker.MagicMock()
    provider.consolidate.return_value = mocker.MagicMock(
        decisions=[
            mocker.MagicMock(inbox_index=0, action="new_concept", target="test-concept")
        ]
    )
    provider.generate_briefing.return_value = "# Memory\nContent."
    provider.generate_skill.return_value = "# Skill"
    provider.validate_thesis.side_effect = Exception("skip")

    mocker.patch("core.micro_consolidation.Registry")
    mocker.patch("core.micro_consolidation.AgentState")

    mc = MicroConsolidation(tmp_path, config, provider, soul="Expert.")
    mc.run(item="New insight about trading.")

    concept_path = tmp_path / "knowledge" / "concepts" / "test-concept.md"
    assert concept_path.exists(), "concept file must be written"
    assert (tmp_path / "memory.md").exists(), "memory.md must be updated"


def test_micro_consolidation_write_recent(tmp_path, mocker):
    from core.micro_consolidation import MicroConsolidation
    from core.models.types import AgentConfig

    config = AgentConfig(
        agent_id="test",
        model="gemini",
        analysis_mode="transcript_only",
        sources={},
        consolidation_schedule="0 3 * * 0",
        decay={"half_life_days": 365},
        reflect_immediately=True,
    )
    provider = mocker.MagicMock()
    provider.consolidate.return_value = mocker.MagicMock(
        decisions=[
            mocker.MagicMock(inbox_index=0, action="new_recent", target="recent-event")
        ]
    )
    provider.generate_briefing.return_value = "# Memory\nRecent."
    provider.generate_skill.return_value = "# Skill"
    provider.validate_thesis.side_effect = Exception("skip")

    mocker.patch("core.micro_consolidation.Registry")
    mocker.patch("core.micro_consolidation.AgentState")

    mc = MicroConsolidation(tmp_path, config, provider, soul="Expert.")
    mc.run(item="New recent event happened.")

    recent_files = list((tmp_path / "knowledge" / "recent").rglob("*.md"))
    assert len(recent_files) > 0, "recent file must be written"
