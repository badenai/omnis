import json
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
    call_kwargs = mock_client.models.generate_content.call_args.kwargs
    assert "concepts/topic.md" in str(call_kwargs["contents"])
    assert "Some knowledge content." in str(call_kwargs["contents"])
    assert SOUL in str(call_kwargs["contents"])
    assert call_kwargs["model"] == provider._consolidation_model_name


def test_analyze_web_content_returns_analysis_result():
    provider = GeminiProvider.__new__(GeminiProvider)
    provider._model_name = "gemini-test"
    mock_text = json.dumps({
        "video_id": "web-abc123", "video_title": "Test Page",
        "insights": ["insight 1"], "relevance_score": 0.7,
        "suggested_action": "new_concept", "suggested_target": "test-page",
        "raw_summary": "A summary."
    })
    with patch.object(provider, '_generate', return_value=mock_text):
        result = provider.analyze_web_content(
            url="https://example.com/article",
            text="Article body text here.",
            title="Test Page",
            soul="## Domain\nTest domain.",
        )
    assert result.video_title == "Test Page"
    assert result.relevance_score == 0.7


def test_analyze_uploaded_file_calls_files_api():
    provider = GeminiProvider.__new__(GeminiProvider)
    provider._client = MagicMock()
    provider._model_name = "gemini-test"
    mock_file = MagicMock()
    mock_file.name = "files/abc123"
    provider._client.files.upload.return_value = mock_file
    mock_resp = MagicMock()
    mock_resp.text = json.dumps({
        "video_id": "file-abc", "video_title": "document.pdf",
        "insights": ["insight"], "relevance_score": 0.8,
        "suggested_action": "new_concept", "suggested_target": "document",
        "raw_summary": "PDF summary."
    })
    provider._client.models.generate_content.return_value = mock_resp
    result = provider.analyze_uploaded_file(
        file_bytes=b"%PDF-1.4 content",
        mime_type="application/pdf",
        title="document.pdf",
        soul="## Domain\nTest.",
    )
    assert provider._client.files.upload.called
    assert result.video_title == "document.pdf"


def test_screen_videos_returns_relevant_ids(mocker):
    from core.models.gemini import GeminiProvider
    provider = GeminiProvider(api_key="fake")
    mocker.patch.object(provider, "_generate", return_value='{"relevant_ids": ["abc", "xyz"]}')
    videos = [
        {"id": "abc", "title": "Relevant Video", "description": ""},
        {"id": "def", "title": "Unrelated Video", "description": ""},
        {"id": "xyz", "title": "Also Relevant", "description": ""},
    ]
    result = provider.screen_videos(videos, soul="AI research")
    assert result == ["abc", "xyz"]

def test_screen_videos_empty_input_returns_empty(mocker):
    from core.models.gemini import GeminiProvider
    provider = GeminiProvider(api_key="fake")
    mock_gen = mocker.patch.object(provider, "_generate")
    result = provider.screen_videos([], soul="AI research")
    assert result == []
    mock_gen.assert_not_called()

def test_screen_videos_missing_key_returns_empty(mocker):
    from core.models.gemini import GeminiProvider
    provider = GeminiProvider(api_key="fake")
    mocker.patch.object(provider, "_generate", return_value='{"other_key": []}')
    result = provider.screen_videos([{"id": "a", "title": "T", "description": ""}], soul="AI")
    assert result == []
