# tests/test_github_publisher.py
import pathlib
import pytest
from core.github_publisher import GitHubPublisher

def _make_publisher():
    return GitHubPublisher(token="tok", repo="owner/repo")

def test_extract_description_returns_first_non_heading_line(tmp_path):
    (tmp_path / "SOUL.md").write_text("# Agent Title\n\nFocus on trading systems.\n")
    pub = _make_publisher()
    assert pub._extract_description(tmp_path) == "Focus on trading systems."

def test_extract_description_skips_blank_lines(tmp_path):
    (tmp_path / "SOUL.md").write_text("\n\n# Heading\n\nActual content here.\n")
    pub = _make_publisher()
    assert pub._extract_description(tmp_path) == "Actual content here."

def test_extract_description_strips_bold_markers(tmp_path):
    (tmp_path / "SOUL.md").write_text("**Focus on** trading.\n")
    pub = _make_publisher()
    assert pub._extract_description(tmp_path) == "Focus on trading."

def test_extract_description_truncates_to_200(tmp_path):
    (tmp_path / "SOUL.md").write_text("x" * 300 + "\n")
    pub = _make_publisher()
    assert len(pub._extract_description(tmp_path)) == 200

def test_extract_description_missing_soul_returns_empty(tmp_path):
    pub = _make_publisher()
    assert pub._extract_description(tmp_path) == ""

def test_extract_description_only_headings_returns_empty(tmp_path):
    (tmp_path / "SOUL.md").write_text("# Title\n## Subtitle\n")
    pub = _make_publisher()
    assert pub._extract_description(tmp_path) == ""

def test_extract_description_strips_italic_markers(tmp_path):
    (tmp_path / "SOUL.md").write_text("*Focus on* trading.\n")
    pub = _make_publisher()
    assert pub._extract_description(tmp_path) == "Focus on trading."

def test_extract_description_strips_underscore_italic(tmp_path):
    (tmp_path / "SOUL.md").write_text("_Focus on_ trading.\n")
    pub = _make_publisher()
    assert pub._extract_description(tmp_path) == "Focus on trading."
