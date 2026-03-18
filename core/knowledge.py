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

    def write_concept(self, name: str, content: str, tags: list[str] | None = None, relevance_score: float = 1.0) -> pathlib.Path:
        name = name.removesuffix(".md")
        dest = self._base / "concepts" / f"{name}.md"
        dest.parent.mkdir(parents=True, exist_ok=True)
        now = datetime.now(timezone.utc).date().isoformat()
        metadata = {
            "created": now,
            "updated": now,
            "relevance_score": relevance_score,
            "effective_weight": relevance_score,
            "decay_half_life": self._half_life,
            "sources": [],
            "tags": tags or [],
        }
        post = frontmatter.Post(content, **metadata)
        dest.write_text(frontmatter.dumps(post), encoding="utf-8")
        return dest

    def update_concept(self, name: str, new_content: str, source_id: str, relevance_score: float | None = None) -> pathlib.Path:
        name = name.removesuffix(".md")
        dest = self._base / "concepts" / f"{name}.md"
        if dest.exists():
            post = frontmatter.load(str(dest))
            post.content = new_content
            post["updated"] = datetime.now(timezone.utc).date().isoformat()
            if relevance_score is not None:
                # nudge score toward the new value — reinforce if higher, soften if lower
                old_score = float(post.get("relevance_score", 1.0))
                post["relevance_score"] = round(max(old_score, relevance_score) * 0.7 + relevance_score * 0.3, 4)
            if source_id not in post.get("sources", []):
                post["sources"] = post.get("sources", []) + [source_id]
        else:
            post = frontmatter.Post(new_content, sources=[source_id],
                                    relevance_score=relevance_score if relevance_score is not None else 1.0)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(frontmatter.dumps(post), encoding="utf-8")
        return dest

    def write_recent(self, name: str, content: str, source_id: str, relevance_score: float = 1.0) -> pathlib.Path:
        name = name.removesuffix(".md")
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        dest = self._base / "recent" / month / f"{name}.md"
        dest.parent.mkdir(parents=True, exist_ok=True)
        now = datetime.now(timezone.utc).date().isoformat()
        metadata = {
            "created": now,
            "updated": now,
            "relevance_score": relevance_score,
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

    def prune_low_weight(self, threshold: float = 0.1) -> list[str]:
        """Move files with effective_weight < threshold to knowledge/archived/YYYY-MM/."""
        if not self._base.exists():
            return []
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        archive = self._base / "archived" / month
        pruned = []
        for f in list(self._base.rglob("*.md")):
            if "archived" in f.parts or f.name == "_index.md":
                continue
            post = frontmatter.load(str(f))
            created_str = post.get("created", datetime.now(timezone.utc).date().isoformat())
            age = (datetime.now(timezone.utc).date() - date.fromisoformat(str(created_str))).days
            score = float(post.get("relevance_score", 1.0))
            weight = self.compute_effective_weight(score, age)
            if weight < threshold:
                archive.mkdir(parents=True, exist_ok=True)
                dest = archive / f.name
                f.rename(dest)
                pruned.append(str(f.relative_to(self._base)))
        return pruned

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
