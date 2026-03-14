from core.sources.base import SourceItem
from core.sources import register


class RedditPlugin:
    source_type = "reddit"

    def get_source_id(self, config: dict) -> str:
        return f"reddit:r/{config['subreddit']}"

    def fetch(self, config: dict, processed_ids: set[str]) -> list[SourceItem]:
        import httpx
        subreddit = config["subreddit"]
        min_score = config.get("min_score", 50)
        limit = config.get("limit", 10)
        resp = httpx.get(
            f"https://www.reddit.com/r/{subreddit}/hot.json?limit=25",
            headers={"User-Agent": "OmnisBot/1.0"},
            timeout=20,
        )
        resp.raise_for_status()
        items = []
        for post in resp.json()["data"]["children"]:
            d = post["data"]
            if d["id"] in processed_ids or d.get("score", 0) < min_score:
                continue
            text = f"**{d['title']}**\n\n"
            text += d.get("selftext", "") or f"Link: {d.get('url', '')}"
            text += f"\n\nScore: {d['score']} | Comments: {d['num_comments']}"
            items.append(SourceItem(
                source_id=d["id"],
                title=d["title"],
                source_url=f"https://reddit.com{d['permalink']}",
                content=text[:12000],
            ))
            if len(items) >= limit:
                break
        return items


register(RedditPlugin())
