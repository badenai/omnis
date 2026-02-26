import math
import pathlib
from datetime import datetime, timezone, date

import frontmatter


class KnowledgeWriter:
    def __init__(self, agent_dir: pathlib.Path, half_life_days: int):
        self._base = agent_dir / "knowledge"
        self._half_life = half_life_days

    def compute_effective_weight(self, relevance_score: float, age_days: float) -> float:
        decay = math.exp(-math.log(2) * age_days / self._half_life)
        return round(relevance_score * decay, 4)

    def write_concept(self, name: str, content: str, tags: list[str] | None = None) -> pathlib.Path:
        dest = self._base / "concepts" / f"{name}.md"
        dest.parent.mkdir(parents=True, exist_ok=True)
        now = datetime.now(timezone.utc).date().isoformat()
        metadata = {
            "created": now,
            "updated": now,
            "relevance_score": 1.0,
            "effective_weight": 1.0,
            "decay_half_life": self._half_life,
            "sources": [],
            "tags": tags or [],
        }
        post = frontmatter.Post(content, **metadata)
        dest.write_text(frontmatter.dumps(post), encoding="utf-8")
        return dest

    def update_concept(self, name: str, new_content: str, source_id: str) -> pathlib.Path:
        dest = self._base / "concepts" / f"{name}.md"
        if dest.exists():
            post = frontmatter.load(str(dest))
            post.content = new_content
            post["updated"] = datetime.now(timezone.utc).date().isoformat()
            if source_id not in post.get("sources", []):
                post["sources"] = post.get("sources", []) + [source_id]
        else:
            post = frontmatter.Post(new_content, sources=[source_id])
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(frontmatter.dumps(post), encoding="utf-8")
        return dest

    def write_recent(self, name: str, content: str, source_id: str) -> pathlib.Path:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        dest = self._base / "recent" / month / f"{name}.md"
        dest.parent.mkdir(parents=True, exist_ok=True)
        now = datetime.now(timezone.utc).date().isoformat()
        metadata = {
            "created": now,
            "updated": now,
            "relevance_score": 1.0,
            "decay_half_life": self._half_life,
            "sources": [source_id],
            "tags": [],
        }
        post = frontmatter.Post(content, **metadata)
        dest.write_text(frontmatter.dumps(post), encoding="utf-8")
        return dest

    def update_relevance_score(self, relative_path: str, score: float) -> None:
        dest = self._base / relative_path
        if not dest.exists():
            return
        post = frontmatter.load(str(dest))
        post["relevance_score"] = score
        dest.write_text(frontmatter.dumps(post), encoding="utf-8")

    def load_all_weighted(self) -> list[dict]:
        """Load all knowledge files sorted by effective_weight descending."""
        files = []
        if not self._base.exists():
            return files
        for f in self._base.rglob("*.md"):
            if f.name == "_index.md":
                continue
            post = frontmatter.load(str(f))
            created_str = post.get("created", datetime.now(timezone.utc).date().isoformat())
            created = date.fromisoformat(str(created_str))
            age = (datetime.now(timezone.utc).date() - created).days
            score = float(post.get("relevance_score", 1.0))
            weight = self.compute_effective_weight(score, age)
            files.append({
                "path": str(f.relative_to(self._base)),
                "content": post.content,
                "effective_weight": weight,
                "metadata": dict(post.metadata),
            })
        return sorted(files, key=lambda x: x["effective_weight"], reverse=True)
