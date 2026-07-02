"""preprocess_dataset MCP tool.

Applies a sequence of pandas/sklearn preprocessing operations to a dataset
and returns the cleaned CSV bytes along with a diff summary.
"""

from __future__ import annotations

import base64
import io
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from core.format_loader import load_dataframe


def _apply_ops(df: pd.DataFrame, operations: list[dict[str, Any]], target_column: str | None = None) -> tuple[pd.DataFrame, list[str]]:
    """Apply each op in order, return (modified_df, applied_log)."""
    log: list[str] = []

    for op in operations:
        name = op.get("op", "")

        if name == "drop_duplicates":
            before = len(df)
            df = df.drop_duplicates()
            dropped = before - len(df)
            log.append(f"drop_duplicates: removed {dropped} duplicate rows")

        elif name == "drop_missing_rows":
            cols = op.get("columns")
            before = len(df)
            df = df.dropna(subset=cols) if cols else df.dropna()
            dropped = before - len(df)
            log.append(f"drop_missing_rows: removed {dropped} rows with missing values")

        elif name == "impute_median":
            cols = op.get("columns") or df.select_dtypes(include="number").columns.tolist()
            for c in cols:
                if c in df.columns and df[c].isna().any():
                    median_val = df[c].median()
                    df[c] = df[c].fillna(median_val)
            log.append(f"impute_median: filled missing in {cols} with column median")

        elif name == "impute_mode":
            cols = op.get("columns") or df.select_dtypes(include=["object", "category"]).columns.tolist()
            for c in cols:
                if c in df.columns and df[c].isna().any():
                    mode_val = df[c].mode()
                    if len(mode_val):
                        df[c] = df[c].fillna(mode_val[0])
            log.append(f"impute_mode: filled missing in {cols} with column mode")

        elif name == "impute_constant":
            cols = op.get("columns", [])
            value = op.get("value", 0)
            for c in cols:
                if c in df.columns:
                    df[c] = df[c].fillna(value)
            log.append(f"impute_constant: filled missing in {cols} with {value!r}")

        elif name == "drop_columns":
            cols = op.get("columns", [])
            existing = [c for c in cols if c in df.columns]
            df = df.drop(columns=existing)
            log.append(f"drop_columns: dropped {existing}")

        elif name == "one_hot_encode":
            cols = op.get("columns") or df.select_dtypes(include=["object", "category"]).columns.tolist()
            # Never one-hot-encode the target column — it would destroy it as a label
            if target_column:
                cols = [c for c in cols if c != target_column]
            existing = [c for c in cols if c in df.columns]
            df = pd.get_dummies(df, columns=existing, drop_first=False, dtype=int)
            log.append(f"one_hot_encode: encoded {existing}")

        elif name == "label_encode":
            from sklearn.preprocessing import LabelEncoder
            cols = op.get("columns") or df.select_dtypes(include=["object", "category"]).columns.tolist()
            # Never label-encode the target column — its class labels must stay intact for training
            if target_column:
                cols = [c for c in cols if c != target_column]
            for c in cols:
                if c in df.columns:
                    le = LabelEncoder()
                    df[c] = le.fit_transform(df[c].astype(str))
            log.append(f"label_encode: label-encoded {cols}")

        elif name == "standard_scale":
            from sklearn.preprocessing import StandardScaler
            cols = op.get("columns") or df.select_dtypes(include="number").columns.tolist()
            if target_column:
                cols = [c for c in cols if c != target_column]
            existing = [c for c in cols if c in df.columns]
            if existing:
                scaler = StandardScaler()
                df[existing] = scaler.fit_transform(df[existing])
            log.append(f"standard_scale: standardised {existing}")

        elif name == "minmax_scale":
            from sklearn.preprocessing import MinMaxScaler
            cols = op.get("columns") or df.select_dtypes(include="number").columns.tolist()
            if target_column:
                cols = [c for c in cols if c != target_column]
            existing = [c for c in cols if c in df.columns]
            if existing:
                scaler = MinMaxScaler()
                df[existing] = scaler.fit_transform(df[existing])
            log.append(f"minmax_scale: min-max scaled {existing}")

        elif name == "log_transform":
            cols = op.get("columns") or df.select_dtypes(include="number").columns.tolist()
            if target_column:
                cols = [c for c in cols if c != target_column]
            existing = [c for c in cols if c in df.columns]
            for c in existing:
                df[c] = np.log1p(df[c].clip(lower=0))
            log.append(f"log_transform: log1p applied to {existing}")

        elif name == "clip_outliers":
            cols = op.get("columns") or df.select_dtypes(include="number").columns.tolist()
            if target_column:
                cols = [c for c in cols if c != target_column]
            lower_pct = op.get("lower_pct", 1)
            upper_pct = op.get("upper_pct", 99)
            for c in cols:
                if c in df.columns:
                    lo = np.percentile(df[c].dropna(), lower_pct)
                    hi = np.percentile(df[c].dropna(), upper_pct)
                    df[c] = df[c].clip(lo, hi)
            log.append(f"clip_outliers: clipped {cols} to [{lower_pct}th, {upper_pct}th] percentile")

    return df, log


async def preprocess_dataset(
    file_bytes: str,
    filename: str,
    operations: list[dict[str, Any]],
    target_column: str | None = None,
) -> dict[str, Any]:
    """Apply preprocessing operations to a dataset.

    Args:
        file_bytes: Base64-encoded raw file content.
        filename:   Original filename (for format detection).
        operations: Ordered list of operation dicts. Each dict has an "op" key
                    (e.g. "drop_duplicates", "impute_median", "one_hot_encode")
                    and optional "columns" / parameter keys.

    Returns:
        {
            "processed_bytes": "<base64 CSV>",
            "ops_applied": ["...", "..."],
            "shape_before": [rows, cols],
            "shape_after": [rows, cols],
            "missing_before": float,
            "missing_after": float,
            "preview": [<first 5 rows as dicts>],
        }
    """
    raw = base64.b64decode(file_bytes)
    suffix = Path(filename).suffix or ".csv"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = Path(tmp.name)
    df = load_dataframe(tmp_path)
    tmp_path.unlink(missing_ok=True)

    shape_before = list(df.shape)
    missing_before = float(df.isna().mean().mean() * 100) if len(df) else 0.0

    df, ops_applied = _apply_ops(df, operations, target_column=target_column)

    # Always deduplicate after all ops — encoding steps (OHE, label encode) can
    # produce rows that are now identical even if the original data had none.
    dup_count = int(df.duplicated().sum())
    if dup_count > 0:
        df = df.drop_duplicates()
        ops_applied.append(f"auto_dedup: removed {dup_count} duplicate rows created by encoding ops")

    shape_after = list(df.shape)
    missing_after = float(df.isna().mean().mean() * 100) if len(df) else 0.0

    # Serialize back to CSV — use float_format to preserve precision and avoid
    # creating artificial duplicates when Excel floats are rounded during CSV export
    buf = io.StringIO()
    df.to_csv(buf, index=False, float_format="%.10g")
    processed_bytes = base64.b64encode(buf.getvalue().encode()).decode()

    # Preview: first 5 rows, convert to JSON-safe types
    preview_df = df.head(5).copy()
    for col in preview_df.columns:
        if preview_df[col].dtype == object:
            preview_df[col] = preview_df[col].astype(str)
    preview = preview_df.where(pd.notnull(preview_df), None).to_dict(orient="records")

    return {
        "processed_bytes": processed_bytes,
        "ops_applied": ops_applied,
        "shape_before": shape_before,
        "shape_after": shape_after,
        "missing_before": round(missing_before, 2),
        "missing_after": round(missing_after, 2),
        "preview": preview,
    }
