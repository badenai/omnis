from core.sources.base import SourceItem, SourcePlugin

_REGISTRY: dict[str, SourcePlugin] = {}


def register(plugin: SourcePlugin) -> None:
    _REGISTRY[plugin.source_type] = plugin


def get_plugin(source_type: str) -> SourcePlugin:
    if source_type not in _REGISTRY:
        raise ValueError(f"Unknown source type: '{source_type}'")
    return _REGISTRY[source_type]


# Import plugins so they self-register
from core.sources import youtube  # noqa: E402,F401
from core.sources import medium   # noqa: E402,F401
from core.sources import web_page  # noqa: E402,F401
from core.sources import reddit   # noqa: E402,F401

__all__ = ["SourceItem", "SourcePlugin", "register", "get_plugin"]
