"""
Profile embedding utilities.

Converts a ProfileResult dict into a short textual summary, then calls LiteLLM
to produce a 1536-dimensional vector for storage in pgvector.
"""

import litellm

from core.config import settings


def profile_to_text(profile_result: dict) -> str:
    """
    Convert a ProfileResult dict to a compact text summary suitable for embedding.

    Extracts the most semantically meaningful fields: dataset size, quality score,
    column types, target analysis task type, and top recommendations.
    """
    parts: list[str] = []

    # Dataset-level overview
    num_rows = profile_result.get("num_rows", "unknown")
    num_columns = profile_result.get("num_columns", "unknown")
    file_format = profile_result.get("file_format", "")
    parts.append(f"Dataset: {num_rows} rows, {num_columns} columns, format={file_format}.")

    # Quality score
    quality = profile_result.get("quality_score", {})
    if quality:
        score = quality.get("score", "")
        grade = quality.get("grade", "")
        if score or grade:
            parts.append(f"Quality: {score}/100 grade {grade}.")

    # Missing and duplicates
    missing_pct = profile_result.get("missing_cells_pct")
    if missing_pct is not None:
        parts.append(f"Missing cells: {missing_pct:.1f}%.")

    duplicate_pct = profile_result.get("duplicate_rows_pct")
    if duplicate_pct is not None:
        parts.append(f"Duplicate rows: {duplicate_pct:.1f}%.")

    # Column type breakdown
    columns = profile_result.get("columns", [])
    numeric_cols = [c for c in columns if c.get("type") in ("int", "float", "numeric")]
    cat_cols = [c for c in columns if c.get("type") in ("string", "categorical", "object")]
    dt_cols = [c for c in columns if c.get("type") in ("datetime", "date")]
    if columns:
        parts.append(
            f"Column types: {len(numeric_cols)} numeric, "
            f"{len(cat_cols)} categorical, {len(dt_cols)} datetime."
        )

    # Target analysis
    target = profile_result.get("target_analysis", {})
    if target:
        task_type = target.get("task_type", "")
        imbalance_ratio = target.get("imbalance_ratio")
        if task_type:
            line = f"Task type: {task_type}."
            if imbalance_ratio:
                line += f" Imbalance ratio: {imbalance_ratio:.1f}:1."
            parts.append(line)

    # Top recommendations (first 3)
    recommendations = profile_result.get("recommendations", [])
    if recommendations:
        rec_texts = [r.get("message", "") for r in recommendations[:3] if r.get("message")]
        if rec_texts:
            parts.append("Top recommendations: " + "; ".join(rec_texts) + ".")

    return " ".join(parts)


async def embed_profile(profile_summary: str) -> list[float]:
    """
    Embed a profile text summary using LiteLLM with the configured embedding model.

    Args:
        profile_summary: Short text describing the dataset profile.

    Returns:
        List of 1536 floats (embedding vector).
    """
    response = await litellm.aembedding(
        model=settings.LITELLM_EMBEDDING_MODEL,
        input=[profile_summary],
        api_base="https://openrouter.ai/api/v1",
        api_key=settings.OPENROUTER_API_KEY,
    )
    return response.data[0]["embedding"]
