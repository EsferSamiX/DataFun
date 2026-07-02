"""suggest_models MCP tool.

Rule-based model suggestion — no LLM required. Reuses the deterministic
nodes from core.model_suggester (classify_problem, assess_data, flag_concerns)
but replaces the LLM rank_models node with _fallback_suggestions.
"""

from __future__ import annotations

from typing import Any

from core.model_suggester import (
    AgentState,
    _TASK_METRICS,
    _fallback_suggestions,
    assess_data,
    classify_problem,
    flag_concerns,
)


async def suggest_models(
    profile_result: dict[str, Any],
    max_suggestions: int = 5,
) -> dict[str, Any]:
    """Suggest ML models for a dataset based on its profile (rule-based, no LLM).

    Args:
        profile_result:  ProfileResult dict from profile_dataset tool.
        max_suggestions: Maximum number of model suggestions to return (default 5).

    Returns:
        {
            "task_type": str,
            "problem_summary": str,
            "suggestions": [{ rank, algorithm, framework, reason, strengths,
                               weaknesses, complexity, training_speed,
                               suggested_params, trainable }],
            "concerns": [str],
            "evaluation_metrics": [str],
            "preprocessing_steps": [str],
        }
    """
    # Build initial state (same shape as LangGraph AgentState)
    initial_state: AgentState = {
        "profile_result": profile_result,
        "task_type": "",
        "data_assessment": {},
        "suggestions": [],
        "starter_code": "",
        "concerns": [],
        "evaluation_metrics": [],
        "preprocessing_steps": [],
        "max_suggestions": max_suggestions,
    }

    # Run deterministic nodes only (no LLM)
    state = classify_problem(initial_state)
    state = assess_data(state)

    task_type = state["task_type"]
    assessment = state["data_assessment"]
    n = min(max_suggestions, 5)
    suggestions = _fallback_suggestions(task_type, assessment, n)

    # Mark which models can actually be trained in DataFun
    _TRAINABLE = {
        "logistic_regression", "random_forest", "xgboost", "lightgbm",
        "gradient_boosting", "svm", "ridge", "linear_regression",
        "kmeans", "dbscan", "isolation_forest", "one_class_svm",
    }

    def _to_key(name: str) -> str:
        return name.lower().replace(" ", "_").replace("-", "_")

    for s in suggestions:
        s["trainable"] = _to_key(s.get("algorithm", "")) in _TRAINABLE

    state["suggestions"] = suggestions
    state = flag_concerns(state)

    # Build problem summary
    num_rows = assessment.get("num_rows", 0)
    num_cols = assessment.get("num_columns", 0)
    imb_severity = assessment.get("imbalance_severity")
    imb_ratio = assessment.get("imbalance_ratio")

    if imb_severity and imb_severity != "none" and imb_ratio is not None:
        problem_summary = (
            f"{task_type.replace('_', ' ').title()} · "
            f"{num_rows:,} rows · {imb_severity} imbalance ({imb_ratio}:1)"
        )
    else:
        problem_summary = (
            f"{task_type.replace('_', ' ').title()} · "
            f"{num_rows:,} rows · {num_cols} columns"
        )

    return {
        "task_type": task_type,
        "problem_summary": problem_summary,
        "suggestions": suggestions,
        "concerns": state["concerns"],
        "evaluation_metrics": _TASK_METRICS.get(task_type, ["Accuracy"]),
        "preprocessing_steps": state["preprocessing_steps"],
    }
