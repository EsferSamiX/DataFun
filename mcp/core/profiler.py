"""Data profiling engine for DataFun MCP server.

Adapted from corvus data_profiler.py (corvus_ai-0.3.80).
Pure pandas + scipy implementation — no LLM, fully deterministic.

Public API:
    profile_dataframe(df, target_column, sample_size, depth, progress_callback)
        → ProfileResult
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Callable


# ─── Result dataclass ────────────────────────────────────────────────────────

@dataclass
class ProfileResult:
    """Full statistical profile of a dataset."""

    num_rows: int = 0
    num_columns: int = 0
    memory_usage_bytes: int = 0

    columns: list[dict[str, Any]] = field(default_factory=list)

    missing_cells: int = 0
    missing_cells_pct: float = 0.0
    duplicate_rows: int = 0
    duplicate_rows_pct: float = 0.0

    warnings: list[str] = field(default_factory=list)
    correlations: list[dict[str, Any]] = field(default_factory=list)

    quality_score: dict[str, Any] = field(default_factory=dict)
    target_analysis: dict[str, Any] | None = None
    recommendations: list[dict[str, Any]] = field(default_factory=list)
    plots: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to a JSON-safe plain dict."""
        return {
            "num_rows": self.num_rows,
            "num_columns": self.num_columns,
            "memory_usage_bytes": self.memory_usage_bytes,
            "columns": self.columns,
            "missing_cells": self.missing_cells,
            "missing_cells_pct": self.missing_cells_pct,
            "duplicate_rows": self.duplicate_rows,
            "duplicate_rows_pct": self.duplicate_rows_pct,
            "warnings": self.warnings,
            "correlations": self.correlations,
            "quality_score": self.quality_score,
            "target_analysis": self.target_analysis,
            "recommendations": self.recommendations,
            "plots": self.plots,
        }


# ─── Column info extraction ───────────────────────────────────────────────────

def _extract_column_info(df: Any) -> list[dict[str, Any]]:
    """Extract per-column statistics from a DataFrame."""
    from scipy.stats import entropy as _shannon_entropy

    columns: list[dict[str, Any]] = []

    for col in df.columns:
        series = df[col]
        dtype = str(series.dtype)
        dtype_lower = dtype.lower()

        # Classify column type
        if "int" in dtype_lower:
            col_type = "integer"
        elif "float" in dtype_lower:
            col_type = "float"
        elif "bool" in dtype_lower:
            col_type = "boolean"
        elif "datetime" in dtype_lower:
            col_type = "datetime"
        elif "object" in dtype_lower or "string" in dtype_lower or dtype_lower == "str":
            col_type = "string"
            # Promote date-like string columns to datetime
            try:
                _sample = series.dropna().head(20)
                if len(_sample) >= 3:
                    import pandas as _pd
                    _parsed = _pd.to_datetime(_sample, errors="coerce")
                    if _parsed.notna().mean() > 0.8:
                        col_type = "datetime"
            except Exception:
                pass
        elif "category" in dtype_lower:
            col_type = "categorical"
        else:
            col_type = dtype

        missing_count = int(series.isna().sum())
        total = len(series)
        missing_pct = round((missing_count / total) * 100, 2) if total > 0 else 0.0

        # Detect nested list/dict columns before operations that need hashability
        non_null = series.dropna()
        first_val = non_null.iloc[0] if len(non_null) > 0 else None

        if isinstance(first_val, list):
            columns.append({
                "name": str(col),
                "type": "array",
                "dtype": dtype,
                "missing_count": missing_count,
                "missing_pct": missing_pct,
                "unique_count": 0,
                "note": "Nested array column — consider exploding or aggregating before profiling.",
            })
            continue

        if isinstance(first_val, dict):
            columns.append({
                "name": str(col),
                "type": "nested_object",
                "dtype": dtype,
                "missing_count": missing_count,
                "missing_pct": missing_pct,
                "unique_count": 0,
                "note": "Nested object column — consider json_normalize before profiling.",
            })
            continue

        col_info: dict[str, Any] = {
            "name": str(col),
            "type": col_type,
            "dtype": dtype,
            "missing_count": missing_count,
            "missing_pct": missing_pct,
            "unique_count": int(series.nunique()),
        }

        # ── Numeric (integer / float) ────────────────────────────────────
        if col_type in ("integer", "float"):
            if not series.isna().all():
                try:
                    col_info["min"] = _safe_float(series.min())
                    col_info["max"] = _safe_float(series.max())
                    col_info["mean"] = _safe_float(series.mean())
                    std_val = series.std()
                    col_info["std"] = None if _is_nan(std_val) else round(float(std_val), 4)

                    q = series.quantile([0.05, 0.25, 0.50, 0.75, 0.95])
                    col_info["quantiles"] = {
                        "p5":  round(float(q.iloc[0]), 4),
                        "p25": round(float(q.iloc[1]), 4),
                        "p50": round(float(q.iloc[2]), 4),
                        "p75": round(float(q.iloc[3]), 4),
                        "p95": round(float(q.iloc[4]), 4),
                    }

                    skew_val = series.skew()
                    kurt_val = series.kurtosis()
                    col_info["skewness"] = None if _is_nan(skew_val) else round(float(skew_val), 4)
                    col_info["kurtosis"] = None if _is_nan(kurt_val) else round(float(kurt_val), 4)

                    mean_v = series.mean()
                    std_v = col_info["std"]
                    if std_v is not None and mean_v != 0:
                        col_info["cv"] = round(abs(std_v / float(mean_v)), 4)
                    else:
                        col_info["cv"] = 0.0

                    col_info["iqr"] = round(float(q.iloc[3] - q.iloc[1]), 4)
                    col_info["zeros_count"] = int((series == 0).sum())
                    col_info["negative_count"] = int((series < 0).sum())
                except (TypeError, ValueError):
                    col_info["min"] = None
                    col_info["max"] = None
                    col_info["mean"] = None
                    col_info["std"] = None
            else:
                col_info["min"] = None
                col_info["max"] = None
                col_info["mean"] = None
                col_info["std"] = None

            # For low-cardinality integers (≤20 unique), also compute top_values
            # so classification targets can show a distribution bar chart
            if col_type == "integer" and int(series.nunique()) <= 20:
                try:
                    vc = series.value_counts().sort_index()
                    total_non_null = int(series.notna().sum())
                    col_info["top_values"] = [
                        {
                            "value": str(int(vc.index[i])),
                            "count": int(vc.iloc[i]),
                            "pct": round(float(vc.iloc[i] / total_non_null * 100), 2) if total_non_null > 0 else 0.0,
                        }
                        for i in range(len(vc))
                    ]
                except Exception:
                    pass

        # ── String / Categorical ─────────────────────────────────────────
        elif col_type in ("string", "categorical"):
            try:
                vc = series.value_counts()
                if len(vc) > 0:
                    col_info["mode"] = {"value": str(vc.index[0]), "count": int(vc.iloc[0])}
                    total_non_null = int(series.notna().sum())
                    top_n = min(5, len(vc))
                    col_info["top_values"] = [
                        {
                            "value": str(vc.index[i]),
                            "count": int(vc.iloc[i]),
                            "pct": round(float(vc.iloc[i] / total_non_null * 100), 2) if total_non_null > 0 else 0.0,
                        }
                        for i in range(top_n)
                    ]
                    probs = vc.values / vc.values.sum()
                    col_info["entropy"] = round(float(_shannon_entropy(probs)), 4)
                else:
                    col_info["mode"] = None
                    col_info["top_values"] = []
                    col_info["entropy"] = 0.0
            except (TypeError, ValueError):
                col_info["mode"] = None
                col_info["top_values"] = []
                col_info["entropy"] = 0.0

        # ── Datetime ─────────────────────────────────────────────────────
        elif col_type == "datetime":
            if not series.isna().all():
                try:
                    min_dt = series.min()
                    max_dt = series.max()
                    span = max_dt - min_dt
                    col_info["time_range"] = {
                        "min": str(min_dt),
                        "max": str(max_dt),
                        "span_days": int(span.days),
                    }
                except (TypeError, ValueError):
                    pass

        columns.append(col_info)

    return columns


def _safe_float(val: Any) -> float | None:
    """Cast to float, returning None for NaN / inf."""
    try:
        v = float(val)
        return None if (math.isnan(v) or math.isinf(v)) else v
    except (TypeError, ValueError):
        return None


def _is_nan(val: Any) -> bool:
    """Check if value is NaN (handles numpy scalars too)."""
    try:
        return math.isnan(float(val))
    except (TypeError, ValueError):
        return False


# ─── Correlation extraction ───────────────────────────────────────────────────

def _extract_correlations(df: Any, top_n: int = 10) -> list[dict[str, Any]]:
    """Compute top-N correlation pairs using Pearson, Spearman, and point-biserial."""
    try:
        from scipy.stats import pearsonr, pointbiserialr, spearmanr

        numeric_df = df.select_dtypes(include=["number"])
        if numeric_df.shape[1] < 2:
            return []

        binary_cols = {
            c for c in numeric_df.columns
            if set(numeric_df[c].dropna().unique()) <= {0, 1}
        }

        cols = list(numeric_df.columns)
        pairs: list[dict[str, Any]] = []

        for i, col1 in enumerate(cols):
            for j, col2 in enumerate(cols):
                if i >= j:
                    continue

                s1 = numeric_df[col1].dropna()
                s2 = numeric_df[col2].dropna()
                common_idx = s1.index.intersection(s2.index)
                if len(common_idx) < 3:
                    continue
                v1, v2 = s1[common_idx], s2[common_idx]

                is_pb = (col1 in binary_cols) != (col2 in binary_cols)

                if is_pb:
                    bin_col = col1 if col1 in binary_cols else col2
                    cont_col = col2 if col1 in binary_cols else col1
                    try:
                        corr_val, p_val = pointbiserialr(
                            numeric_df[bin_col][common_idx],
                            numeric_df[cont_col][common_idx],
                        )
                        if not _is_nan(corr_val) and not _is_nan(p_val):
                            pairs.append({
                                "column1": str(col1),
                                "column2": str(col2),
                                "correlation": round(float(corr_val), 4),
                                "method": "point_biserial",
                                "p_value": round(float(p_val), 6),
                                "significant": bool(p_val < 0.05),
                            })
                    except Exception:
                        pass
                else:
                    # Pearson
                    try:
                        corr_val, p_val = pearsonr(v1, v2)
                        if not _is_nan(corr_val) and not _is_nan(p_val):
                            pairs.append({
                                "column1": str(col1),
                                "column2": str(col2),
                                "correlation": round(float(corr_val), 4),
                                "method": "pearson",
                                "p_value": round(float(p_val), 6),
                                "significant": bool(p_val < 0.05),
                            })
                    except Exception:
                        pass

                    # Spearman
                    try:
                        corr_val, p_val = spearmanr(v1, v2)
                        if not _is_nan(corr_val) and not _is_nan(p_val):
                            pairs.append({
                                "column1": str(col1),
                                "column2": str(col2),
                                "correlation": round(float(corr_val), 4),
                                "method": "spearman",
                                "p_value": round(float(p_val), 6),
                                "significant": bool(p_val < 0.05),
                            })
                    except Exception:
                        pass

        pairs.sort(key=lambda x: abs(x["correlation"]), reverse=True)
        return pairs[:top_n]

    except Exception:
        return []


# ─── Target analysis ──────────────────────────────────────────────────────────

def _analyze_target(
    df: Any,
    target_column: str | None,
    columns: list[dict[str, Any]],
    correlations: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Analyse the target variable for ML readiness.

    Returns None when no target_column is given or it is absent from the df.
    """
    if target_column is None or target_column not in df.columns:
        return None

    target = df[target_column]
    if target.isna().all():
        return None

    n_unique = int(target.nunique())
    if n_unique <= 1:
        return {
            "task_type": "invalid_single_class",
            "num_classes": n_unique,
            "classes": {str(k): int(v) for k, v in target.value_counts().items()},
            "imbalance_ratio": None,
            "imbalance_severity": None,
            "recommended_strategy": None,
            "leakage_candidates": [],
            "top_correlated_features": [],
        }

    result: dict[str, Any] = {"column": target_column}

    col_info = next((c for c in columns if c["name"] == target_column), None)
    is_numeric = col_info and col_info["type"] in ("integer", "float") if col_info else False

    if is_numeric and n_unique > 20:
        result["task_type"] = "regression"
        skew_val = float(target.skew())
        result["target_skewness"] = None if _is_nan(skew_val) else round(skew_val, 4)
        result["log_transform_recommended"] = (
            abs(skew_val) > 1.0 if not _is_nan(skew_val) else False
        )
    elif n_unique == 2:
        result["task_type"] = "binary_classification"
    else:
        result["task_type"] = "multiclass_classification"

    # Class distribution (classification only)
    if result["task_type"] != "regression":
        vc = target.value_counts()
        result["classes"] = {str(k): int(v) for k, v in vc.items()}
        result["num_classes"] = n_unique

        majority = int(vc.iloc[0])
        minority = int(vc.iloc[-1])
        ratio = round(majority / minority, 1) if minority > 0 else 999999.0
        result["imbalance_ratio"] = ratio

        if ratio < 1.5:
            result["imbalance_severity"] = "none"
        elif ratio < 3:
            result["imbalance_severity"] = "mild"
        elif ratio < 10:
            result["imbalance_severity"] = "moderate"
        else:
            result["imbalance_severity"] = "severe"

        if result["imbalance_severity"] == "none":
            result["recommended_strategy"] = None
        elif result["imbalance_severity"] == "mild":
            result["recommended_strategy"] = "class_weight"
        elif result["imbalance_severity"] == "moderate":
            result["recommended_strategy"] = "SMOTE"
        else:
            result["recommended_strategy"] = "SMOTE + undersampling"
    else:
        result["num_classes"] = None
        result["classes"] = None
        result["imbalance_ratio"] = None
        result["imbalance_severity"] = None
        result["recommended_strategy"] = None

    # Leakage detection: features with >0.95 correlation to target
    leakage_candidates: list[str] = []
    for corr in correlations:
        if target_column in (corr["column1"], corr["column2"]):
            other = corr["column2"] if corr["column1"] == target_column else corr["column1"]
            if abs(corr["correlation"]) > 0.95:
                leakage_candidates.append(other)
    result["leakage_candidates"] = sorted(set(leakage_candidates))

    # Top correlated features (excluding leakage candidates)
    target_corrs: list[dict[str, Any]] = []
    for corr in correlations:
        if target_column in (corr["column1"], corr["column2"]):
            other = corr["column2"] if corr["column1"] == target_column else corr["column1"]
            if other not in leakage_candidates:
                target_corrs.append({
                    "feature": other,
                    "correlation": corr["correlation"],
                    "method": corr.get("method", "pearson"),
                })

    seen: dict[str, dict[str, Any]] = {}
    for tc in target_corrs:
        f = tc["feature"]
        if f not in seen or abs(tc["correlation"]) > abs(seen[f]["correlation"]):
            seen[f] = tc
    result["top_correlated_features"] = sorted(
        seen.values(), key=lambda x: abs(x["correlation"]), reverse=True
    )[:10]

    return result


# ─── Quality score ────────────────────────────────────────────────────────────

def _compute_quality_score(result: ProfileResult) -> dict[str, Any]:
    """Compute a 0-100 quality score with grade.

    Weights:
        Completeness  30%  — 100 minus missing cell %
        Uniqueness    20%  — 100 minus duplicate row %
        Consistency   25%  — penalises constant / high-missing columns
        Validity      25%  — penalises warning density
    """
    if result.num_rows == 0 or result.num_columns == 0:
        return {
            "overall": 0.0, "grade": "D",
            "completeness": 0.0, "uniqueness": 0.0,
            "consistency": 0.0, "validity": 0.0,
        }

    completeness = max(0.0, 100.0 - result.missing_cells_pct)
    uniqueness = max(0.0, 100.0 - result.duplicate_rows_pct)

    constant_cols = sum(1 for c in result.columns if c.get("unique_count", 0) == 1)
    high_missing = sum(1 for c in result.columns if c.get("missing_pct", 0) > 50)
    problem_ratio = (constant_cols + high_missing) / result.num_columns
    consistency = max(0.0, 100.0 - problem_ratio * 100.0)

    warning_ratio = len(result.warnings) / result.num_columns
    validity = max(0.0, 100.0 - warning_ratio * 30.0)

    overall = round(
        completeness * 0.30
        + uniqueness * 0.20
        + consistency * 0.25
        + validity * 0.25,
        1,
    )

    if overall >= 90:
        grade = "A"
    elif overall >= 75:
        grade = "B"
    elif overall >= 60:
        grade = "C"
    else:
        grade = "D"

    return {
        "overall": overall,
        "grade": grade,
        "completeness": round(completeness, 1),
        "uniqueness": round(uniqueness, 1),
        "consistency": round(consistency, 1),
        "validity": round(validity, 1),
    }


# ─── Warnings ────────────────────────────────────────────────────────────────

def _generate_warnings(df: Any, columns: list[dict[str, Any]]) -> list[str]:
    """Generate data quality warning strings."""
    warnings: list[str] = []

    for col in columns:
        mp = col.get("missing_pct", 0)
        if mp > 50:
            warnings.append(f"Column '{col['name']}' has >50% missing values")
        elif mp > 20:
            warnings.append(f"Column '{col['name']}' has >20% missing values")

    for col in columns:
        if col.get("unique_count", 0) == 1:
            warnings.append(f"Column '{col['name']}' has only 1 unique value (constant)")

    for col in columns:
        if col.get("type") == "string":
            n_unique = col.get("unique_count", 0)
            unique_ratio = n_unique / len(df) if len(df) > 0 else 0
            if unique_ratio > 0.9 and n_unique > 100:
                warnings.append(
                    f"Column '{col['name']}' has very high cardinality (possible ID column)"
                )

    for col in columns:
        skew = col.get("skewness")
        if skew is not None and abs(skew) > 2:
            warnings.append(f"Column '{col['name']}' is highly skewed (skewness={skew:.2f})")

    for col in columns:
        if col.get("type") in ("integer", "float") and col.get("std") == 0.0:
            if col.get("unique_count", 0) > 1:
                warnings.append(f"Column '{col['name']}' has zero variance")

    return warnings


# ─── Recommendations ──────────────────────────────────────────────────────────

def _generate_recommendations(result: ProfileResult) -> list[dict[str, Any]]:
    """Generate prioritised, actionable preprocessing recommendations."""
    recs: list[dict[str, Any]] = []

    for col in result.columns:
        mp = col.get("missing_pct", 0)
        if mp > 50:
            recs.append({
                "category": "missing_data",
                "priority": "high",
                "message": f"Column '{col['name']}' has {mp:.1f}% missing values",
                "action": "Consider dropping this column or using advanced imputation",
            })
        elif mp > 5:
            recs.append({
                "category": "missing_data",
                "priority": "medium",
                "message": f"Column '{col['name']}' has {mp:.1f}% missing values",
                "action": "Impute with median (numeric) or mode (categorical)",
            })

    for col in result.columns:
        if col.get("unique_count", 0) == 1:
            recs.append({
                "category": "constant",
                "priority": "medium",
                "message": f"Column '{col['name']}' is constant (1 unique value)",
                "action": "Drop this column — it provides no information",
            })

    if result.duplicate_rows_pct > 1:
        recs.append({
            "category": "duplicates",
            "priority": "medium",
            "message": f"{result.duplicate_rows_pct:.1f}% duplicate rows detected",
            "action": "Deduplicate rows before training",
        })

    for col in result.columns:
        if col.get("type") == "string" and col.get("unique_count", 0) > 20:
            recs.append({
                "category": "encoding",
                "priority": "medium",
                "message": f"Column '{col['name']}' has {col['unique_count']} unique values",
                "action": "Use target encoding or frequency encoding instead of one-hot",
            })
        elif col.get("type") in ("string", "categorical"):
            recs.append({
                "category": "encoding",
                "priority": "low",
                "message": f"Column '{col['name']}' is categorical ({col.get('unique_count', 0)} values)",
                "action": "One-hot encode or label encode for model training",
            })

    target = result.target_analysis
    if target:
        severity = target.get("imbalance_severity")
        if severity in ("moderate", "severe"):
            strategy = target.get("recommended_strategy", "SMOTE")
            recs.append({
                "category": "imbalance",
                "priority": "high",
                "message": (
                    f"Target has {severity} class imbalance "
                    f"(ratio {target['imbalance_ratio']}:1)"
                ),
                "action": f"Apply {strategy} or class weighting",
            })

        for feat in target.get("leakage_candidates", []):
            recs.append({
                "category": "leakage",
                "priority": "high",
                "message": f"Feature '{feat}' has suspiciously high correlation with target",
                "action": "Investigate and likely remove before training",
            })

        if target.get("log_transform_recommended"):
            recs.append({
                "category": "feature_engineering",
                "priority": "medium",
                "message": f"Target is skewed (skewness={target.get('target_skewness')})",
                "action": "Apply log transform to normalize target distribution",
            })

    priority_order = {"high": 0, "medium": 1, "low": 2}
    recs.sort(key=lambda x: priority_order.get(x["priority"], 3))
    return recs


# ─── Target auto-detection ───────────────────────────────────────────────────

_TARGET_NAME_PATTERNS = [
    "target", "label", "labels", "class", "classes", "y", "output", "outputs",
    "response", "outcome", "dependent", "result", "results",
    "price", "cost", "salary", "wage", "revenue", "sales", "amount",
    "churn", "fraud", "survived", "survival", "default", "converted",
    "score", "rating", "rank", "grade",
    "species", "category", "status", "flag",
    "disease", "diabetic", "diagnosis", "diagnosed", "sick", "condition",
]

def _auto_detect_target(df: Any) -> str | None:
    """Heuristically pick the most likely target column.

    Priority order:
    1. Column whose name exactly matches a known target keyword (case-insensitive)
    2. Column whose name ends with a known target keyword
    3. Binary column (only 2 unique non-null values)
    4. Low-cardinality categorical column (≤10 unique values, <5% of rows)
    5. Last column (common ML convention)
    """
    cols = list(df.columns)
    if not cols:
        return None

    col_lower = {c: str(c).lower().strip() for c in cols}

    # 1 — exact name match
    for col in cols:
        if col_lower[col] in _TARGET_NAME_PATTERNS:
            return col

    # 2 — ends with a target keyword
    for col in cols:
        for kw in _TARGET_NAME_PATTERNS:
            if col_lower[col].endswith(kw) or col_lower[col].endswith(f"_{kw}"):
                return col

    # 3 — binary column
    for col in cols:
        n_unique = df[col].nunique()
        if n_unique == 2:
            return col

    # 4 — low-cardinality categorical (object/category dtype, ≤10 unique, <5% of rows)
    for col in cols:
        dtype = str(df[col].dtype).lower()
        if "object" in dtype or "category" in dtype or "str" in dtype:
            n_unique = df[col].nunique()
            if 2 <= n_unique <= 10 and n_unique < max(1, len(df) * 0.05):
                return col

    # 5 — fallback: last column
    return cols[-1]


# ─── Public entry point ───────────────────────────────────────────────────────

def profile_dataframe(
    df: Any,
    target_column: str | None = None,
    sample_size: int | None = None,
    depth: str = "standard",
    progress_callback: Callable[[str, str], None] | None = None,
) -> ProfileResult:
    """Profile a pandas DataFrame and return a ProfileResult.

    Args:
        df: The DataFrame to profile.
        target_column: Optional column name to use as ML target for target analysis.
        sample_size: If set, randomly sample this many rows before profiling.
        depth: "quick" (skip correlations), "standard", or "deep" (same as standard here).
        progress_callback: Optional callable(stage_name, summary_text) fired after
            each of the 8 profiling stages completes.

    Returns:
        ProfileResult dataclass.
    """
    if depth not in ("quick", "standard", "deep"):
        raise ValueError(f"depth must be 'quick', 'standard', or 'deep', got {depth!r}")

    minimal = depth == "quick"

    # Auto-detect target if not specified
    if target_column is None:
        target_column = _auto_detect_target(df)

    def _emit(stage: str, summary: str) -> None:
        if progress_callback is not None:
            try:
                progress_callback(stage, summary)
            except Exception:
                pass

    # ── Stage 1: Dataset Overview ────────────────────────────────────────
    if sample_size is not None and len(df) > sample_size:
        df = df.sample(n=sample_size, random_state=42)

    num_rows = len(df)
    num_columns = len(df.columns)
    memory_usage = int(df.memory_usage(deep=True).sum())

    _emit(
        "dataset_overview",
        f"{num_rows:,} rows · {num_columns} columns · {memory_usage / 1024 / 1024:.1f} MB",
    )

    # ── Stage 2: Missing Values ──────────────────────────────────────────
    columns = _extract_column_info(df)

    total_cells = num_rows * num_columns
    missing_cells = sum(c["missing_count"] for c in columns)
    missing_pct = round((missing_cells / total_cells * 100) if total_cells > 0 else 0.0, 2)

    high_missing_count = sum(1 for c in columns if c.get("missing_pct", 0) > 20)
    very_high_missing = sum(1 for c in columns if c.get("missing_pct", 0) > 50)
    _emit(
        "missing_values",
        f"{high_missing_count} columns >20% missing · {very_high_missing} columns >50%",
    )

    # ── Stage 3: Duplicates ──────────────────────────────────────────────
    duplicate_rows = int(df.duplicated().sum())
    duplicate_pct = round((duplicate_rows / num_rows * 100) if num_rows > 0 else 0.0, 2)
    _emit("duplicates", f"{duplicate_rows:,} duplicate rows ({duplicate_pct:.1f}%)")

    # ── Stage 4: Column Statistics ───────────────────────────────────────
    n_numeric = sum(1 for c in columns if c["type"] in ("integer", "float"))
    n_cat = sum(1 for c in columns if c["type"] in ("string", "categorical"))
    n_dt = sum(1 for c in columns if c["type"] == "datetime")
    _emit(
        "column_statistics",
        f"{n_numeric} numeric · {n_cat} categorical · {n_dt} datetime",
    )

    # ── Stage 5: Correlations ────────────────────────────────────────────
    correlations: list[dict] = []
    if not minimal:
        correlations = _extract_correlations(df)
    sig_pairs = sum(1 for c in correlations if c.get("significant", False))
    _emit("correlations", f"{sig_pairs} significant pairs found")

    # ── Generate warnings ────────────────────────────────────────────────
    warnings_list = _generate_warnings(df, columns)

    # ── Build result ─────────────────────────────────────────────────────
    result = ProfileResult(
        num_rows=num_rows,
        num_columns=num_columns,
        memory_usage_bytes=memory_usage,
        columns=columns,
        missing_cells=missing_cells,
        missing_cells_pct=missing_pct,
        duplicate_rows=duplicate_rows,
        duplicate_rows_pct=duplicate_pct,
        warnings=warnings_list,
        correlations=correlations,
    )

    # ── Stage 6: Quality Score ───────────────────────────────────────────
    result.quality_score = _compute_quality_score(result)
    qs = result.quality_score
    _emit("quality_score", f"Score: {qs['overall']}/100 · Grade {qs['grade']}")

    # ── Stage 7: Target Analysis ─────────────────────────────────────────
    result.target_analysis = _analyze_target(df, target_column, columns, correlations)
    if result.target_analysis:
        ta = result.target_analysis
        task = ta.get("task_type", "unknown")
        imb = ta.get("imbalance_severity", "n/a")
        ratio = ta.get("imbalance_ratio", "n/a")
        _emit("target_analysis", f"{task} · imbalance {imb} ({ratio}:1)")
    else:
        _emit("target_analysis", "No target column specified")

    # ── Stage 8: Recommendations ─────────────────────────────────────────
    result.recommendations = _generate_recommendations(result)
    high_recs = sum(1 for r in result.recommendations if r["priority"] == "high")
    _emit(
        "recommendations",
        f"{len(result.recommendations)} recommendations ({high_recs} high priority)",
    )

    # ── Plots (non-fatal) ────────────────────────────────────────────────
    try:
        from core.plots import generate_plots as _generate_plots
        result.plots = _generate_plots(df, columns, target_column)
    except Exception:
        result.plots = {}

    return result
