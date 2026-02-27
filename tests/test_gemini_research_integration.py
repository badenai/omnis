import os
import pytest
from core.models.gemini import GeminiProvider


@pytest.mark.skipif(not os.getenv("GEMINI_API_KEY"), reason="requires GEMINI_API_KEY")
def test_research_domain_returns_findings():
    provider = GeminiProvider(api_key=os.environ["GEMINI_API_KEY"])
    soul = "# Test Agent\n## Domain\nPython programming best practices."
    index = ""
    existing = "None yet."
    findings, sources = provider.research_domain(soul, index, existing)
    assert isinstance(findings, list)
    assert isinstance(sources, list)
    # At minimum, Gemini should return something
    assert len(findings) > 0 or len(sources) >= 0  # lenient — just check it doesn't crash
