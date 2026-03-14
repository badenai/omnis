import re
import hashlib

from core.sources.base import SourceItem
from core.sources import register


class MediumPlugin:
    source_type = "medium"

    def get_source_id(self, config: dict) -> str:
        return f"medium:{config['handle']}"

    def fetch(self, config: dict, processed_ids: set[str]) -> list[SourceItem]:
        import feedparser
        from markdownify import markdownify
        handle = config["handle"]
        feed = feedparser.parse(f"https://medium.com/feed/{handle}")
        items = []
        for entry in feed.entries:
            url = entry.get("link", "")
            m = re.search(r'-([a-f0-9]{12})$', url)
            article_id = m.group(1) if m else hashlib.md5(url.encode()).hexdigest()[:12]
            if article_id in processed_ids:
                continue
            raw = (entry.get("content") or [{}])[0].get("value") or entry.get("summary", "")
            content = markdownify(raw, strip=["script", "style"])[:12000] if raw else entry.get("title", "")
            items.append(SourceItem(
                source_id=article_id,
                title=entry.get("title", ""),
                source_url=url,
                content=content,
            ))
        return items


register(MediumPlugin())
