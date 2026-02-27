from core.models.gemini import GeminiProvider

SAMPLE_RESEARCH_RESPONSE = """
Some preamble text from Gemini.

---FINDING_START---
TITLE: Gap Trading Patterns
ACTION: new_concept
TARGET: gap-trading-patterns
RELEVANCE: 0.87
SOURCES:
- https://example.com/gaps
- https://youtube.com/watch?v=abc
INSIGHTS:
- Gaps above VWAP tend to fill within 30 minutes
- Pre-market volume is the key signal
SUMMARY:
Recent research confirms that gap trading around VWAP provides high-probability setups.
---FINDING_END---

Some middle text.

---FINDING_START---
TITLE: Risk Management Update
ACTION: update_concept
TARGET: risk-management
RELEVANCE: 0.72
SOURCES:
- https://example.com/risk
INSIGHTS:
- 1% max risk per trade
SUMMARY:
Short summary.
---FINDING_END---

---SOURCE_START---
URL: https://youtube.com/@TradingChannel
TYPE: youtube_channel
HANDLE: @TradingChannel
RATIONALE: Consistent high-quality price action content
---SOURCE_END---
"""


def test_parse_research_response_finds_two_findings():
    provider = GeminiProvider.__new__(GeminiProvider)
    findings, sources = provider._parse_research_response(SAMPLE_RESEARCH_RESPONSE)
    assert len(findings) == 2
    assert findings[0].title == "Gap Trading Patterns"
    assert findings[0].relevance_score == 0.87
    assert findings[0].suggested_action == "new_concept"
    assert "Gaps above VWAP" in findings[0].insights[0]
    assert len(findings[0].sources_consulted) == 2


def test_parse_research_response_finds_one_source():
    provider = GeminiProvider.__new__(GeminiProvider)
    findings, sources = provider._parse_research_response(SAMPLE_RESEARCH_RESPONSE)
    assert len(sources) == 1
    assert sources[0].handle == "@TradingChannel"
    assert sources[0].source_type == "youtube_channel"


def test_parse_research_response_empty_returns_empty():
    provider = GeminiProvider.__new__(GeminiProvider)
    findings, sources = provider._parse_research_response("No blocks here.")
    assert findings == []
    assert sources == []


def test_parse_research_response_malformed_block_is_skipped():
    malformed = "---FINDING_START---\nTITLE: Only title, no other fields\n---FINDING_END---"
    provider = GeminiProvider.__new__(GeminiProvider)
    findings, sources = provider._parse_research_response(malformed)
    # Should not raise; malformed block may be skipped or partially parsed
    assert isinstance(findings, list)


SAMPLE_VALIDATION_RESPONSE = """
---FLAG_START---
PATH: concepts/gap-trading.md
SEVERITY: high
CONCERN: New SEC regulations make this approach illegal in 2026
---FLAG_END---

---FLAG_START---
PATH: concepts/risk-management.md
SEVERITY: low
CONCERN: Percentages slightly outdated, new research suggests 0.5% max
---FLAG_END---

VALIDATION_SUMMARY:
Most knowledge is current. One critical flag regarding regulatory changes.
"""


def test_parse_validation_response_finds_two_flags():
    provider = GeminiProvider.__new__(GeminiProvider)
    result = provider._parse_validation_response(SAMPLE_VALIDATION_RESPONSE)
    assert len(result.flagged_files) == 2
    assert result.flagged_files[0]["severity"] == "high"
    assert result.flagged_files[1]["path"] == "concepts/risk-management.md"


def test_parse_validation_response_extracts_summary():
    provider = GeminiProvider.__new__(GeminiProvider)
    result = provider._parse_validation_response(SAMPLE_VALIDATION_RESPONSE)
    assert "Most knowledge is current" in result.validation_summary
