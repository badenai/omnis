from unittest.mock import MagicMock, patch
from core.models.gemini import GeminiProvider
from core.models.types import AnalysisResult

SOUL = "I am a trading knowledge agent."
PROMPT = "Extract trading insights."

_VALID_RESPONSE = """{
    "video_id": "abc123",
    "video_title": "Test",
    "insights": ["insight 1"],
    "relevance_score": 0.8,
    "suggested_action": "new_concept",
    "suggested_target": "test-concept",
    "raw_summary": "summary"
}"""


def _make_mock_client(response_text: str):
    mock_client = MagicMock()
    mock_client.models.generate_content.return_value.text = response_text
    return mock_client


def test_analyze_transcript_returns_analysis_result(mocker):
    mock_client = _make_mock_client(_VALID_RESPONSE)
    mocker.patch("core.models.gemini.genai.Client", return_value=mock_client)

    provider = GeminiProvider(api_key="fake-key")
    result = provider.analyze_transcript("abc123", "Test", "transcript text", SOUL, PROMPT)

    assert isinstance(result, AnalysisResult)
    assert result.relevance_score == 0.8
    mock_client.models.generate_content.assert_called_once()


def test_analyze_video_uses_url(mocker):
    mock_client = _make_mock_client("""{
        "video_id": "xyz",
        "video_title": "YT Video",
        "insights": [],
        "relevance_score": 0.5,
        "suggested_action": "new_recent",
        "suggested_target": "recent-note",
        "raw_summary": ""
    }""")
    mocker.patch("core.models.gemini.genai.Client", return_value=mock_client)

    provider = GeminiProvider(api_key="fake-key")
    result = provider.analyze_video("xyz", "YT Video", "https://youtube.com/watch?v=xyz", SOUL, PROMPT)

    assert isinstance(result, AnalysisResult)
    # Verify the URL was included in the contents passed to generate_content
    call = mock_client.models.generate_content.call_args
    contents = call.kwargs.get("contents", "")
    assert "youtube.com" in str(contents)


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
