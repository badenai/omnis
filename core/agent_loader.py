import pathlib
from core.config import load_agent_config, load_soul
from core.models.gemini import GeminiProvider
from core.pipeline import CollectionPipeline
from core.consolidation import ConsolidationPipeline
from core.self_improving import SelfImprovingSession
from core.manual_ingestion import ManualIngestionPipeline
from core.fact_checker import FactChecker


def load_agent(agent_dir: pathlib.Path, gemini_api_key: str) -> dict:
    config = load_agent_config(agent_dir / "config.yaml")
    soul = load_soul(agent_dir)

    if config.model == "gemini":
        provider = GeminiProvider(
            api_key=gemini_api_key,
            model_name=config.collection_model,
            consolidation_model_name=config.consolidation_model,
        )
    else:
        raise ValueError(f"Unsupported model: {config.model}")

    consolidation = ConsolidationPipeline(agent_dir, config, provider, soul)
    return {
        "config": config,
        "soul": soul,
        "provider": provider,
        "dir": agent_dir,
        "collection": CollectionPipeline(agent_dir, config, provider, soul),
        "consolidation": consolidation,
        "self_improving": SelfImprovingSession(agent_dir, config, provider, soul),
        "ingestion": ManualIngestionPipeline(agent_dir, config, provider, soul, consolidation),
        "fact_checker": FactChecker(agent_dir, config, provider, soul),
    }
