from unittest.mock import MagicMock
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
