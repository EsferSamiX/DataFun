"""suggest_model MCP tool.

Takes a ProfileResult dict and runs the LangGraph suggestion agent,
returning a SuggestionResult dict.
"""

from __future__ import annotations

from core.config import settings
from core.model_suggester import run_suggestion_agent


async def suggest_model(
    profile_result: dict,
    max_suggestions: int = 5,
) -> dict:
    """Suggest the best ML models for a dataset based on its profile.

    Runs a LangGraph 5-node agent internally that calls LiteLLM → OpenRouter.

    Args:
        profile_result: ProfileResult dict as returned by profile_dataset.
        max_suggestions: Maximum number of model suggestions to include.

    Returns:
        SuggestionResult dict with ranked models, starter code, and concerns.
    """
    effective_max = min(max_suggestions, settings.max_suggestions)
    return run_suggestion_agent(profile_result, max_suggestions=effective_max)
