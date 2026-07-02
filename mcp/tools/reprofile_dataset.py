"""reprofile_dataset MCP tool.

Lightweight re-profile of a preprocessed dataset.
Returns column stats and target analysis only — no recommendations,
no quality score, no plots. Used after preprocessing to update the
pipeline view without the overhead of a full profile.
"""

from __future__ import annotations

import base64
import tempfile
from pathlib import Path
from typing import Any

from core.format_loader import load_dataframe
from core.profiler import _auto_detect_target, _extract_column_info, _analyze_target, _extract_correlations


async def reprofile_dataset(
    file_bytes: str,
    filename: str,
    target_column: str | None = None,
) -> dict[str, Any]:
    """Re-profile a preprocessed dataset and return column info + target analysis.

    This is a lightweight alternative to profile_dataset used after preprocessing.
    It does NOT compute recommendations, quality score, or plots.

    Args:
        file_bytes:    Base64-encoded CSV/Excel bytes of the preprocessed file.
        filename:      Original filename (used for format detection).
        target_column: Known target column name. If omitted, auto-detected.

    Returns:
        {
            "num_rows": int,
            "num_columns": int,
            "columns": [...],          # same shape as profile_dataset
            "target_analysis": {...},  # includes "column" key
            "correlations": [...],
        }
    """
    raw = base64.b64decode(file_bytes)
    suffix = Path(filename).suffix or ".csv"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = Path(tmp.name)
    df = load_dataframe(tmp_path)
    tmp_path.unlink(missing_ok=True)

    # Auto-detect target if not provided
    if not target_column or target_column not in df.columns:
        target_column = _auto_detect_target(df)

    columns = _extract_column_info(df)
    correlations = _extract_correlations(df)
    target_analysis = _analyze_target(df, target_column, columns, correlations)

    return {
        "num_rows": int(len(df)),
        "num_columns": int(len(df.columns)),
        "columns": columns,
        "target_analysis": target_analysis,
        "correlations": correlations,
        # stubs so the frontend profile view doesn't break
        "missing_cells": int(df.isna().sum().sum()),
        "missing_cells_pct": round(float(df.isna().mean().mean() * 100), 2),
        "duplicate_rows": int(df.duplicated().sum()),
        "duplicate_rows_pct": round(float(df.duplicated().mean() * 100), 2),
        "warnings": [],
        "quality_score": {},
        "recommendations": [],
        "plots": {},
    }
