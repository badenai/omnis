from core.sources.base import SourceItem
from core.sources import register


class YouTubePlugin:
    source_type = "youtube"

    def get_source_id(self, config: dict) -> str:
        return config["handle"]

    def fetch(self, config: dict, processed_ids: set[str]) -> list[SourceItem]:
        from core.collector import get_new_videos, fetch_transcript
        videos = get_new_videos(config["handle"], processed_ids)
        items = []
        for v in videos:
            if config.get("analysis_mode") == "full_video":
                items.append(SourceItem(
                    source_id=v["id"],
                    title=v.get("title", ""),
                    content="",
                    source_url=v.get("webpage_url", f"https://www.youtube.com/watch?v={v['id']}"),
                    analysis_mode="full_video",
                ))
            else:
                text = fetch_transcript(v["id"])
                items.append(SourceItem(
                    source_id=v["id"],
                    title=v.get("title", ""),
                    content=text,
                    source_url=v.get("webpage_url", f"https://www.youtube.com/watch?v={v['id']}"),
                ))
        return items


register(YouTubePlugin())
