import re
from datetime import date

from core.sources.base import SourceItem
from core.sources import register


class WebPagePlugin:
    source_type = "web_page"

    def get_source_id(self, config: dict) -> str:
        return config["url"]

    def fetch(self, config: dict, processed_ids: set[str]) -> list[SourceItem]:
        import httpx
        from markdownify import markdownify
        url = config["url"]
        day_id = f"web:{url}:{date.today().isoformat()}"
        if day_id in processed_ids:
            return []
        resp = httpx.get(
            url,
            follow_redirects=True,
            timeout=20,
            headers={"User-Agent": "OmnisBot/1.0"},
        )
        resp.raise_for_status()
        m = re.search(r'<title[^>]*>(.*?)</title>', resp.text, re.I | re.S)
        title = m.group(1).strip() if m else url
        content = markdownify(resp.text, strip=["script", "style", "nav", "footer"])[:12000]
        return [SourceItem(source_id=day_id, title=title, source_url=url, content=content)]


register(WebPagePlugin())
