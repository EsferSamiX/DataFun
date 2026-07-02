"""run_inference MCP tool.

Loads a joblib-serialised pipeline and runs inference on a single input row.
"""

from __future__ import annotations

import base64
import io
from typing import Any

import joblib
import numpy as np
import pandas as pd


async def run_inference(
    model_bytes: str,
    feature_values: dict[str, Any],
    task_type: str,
) -> dict[str, Any]:
    """Run inference on a trained model.

    Args:
        model_bytes:    Base64-encoded joblib blob (produced by train_models).
        feature_values: Dict mapping feature column name → value.
        task_type:      Task type string (e.g. "binary_classification").

    Returns:
        {
            "prediction": <str | float | int>,
            "probabilities": {class_name: float} | null,
            "anomaly": bool | null,
            "cluster": int | null,
        }
    """
    blob = base64.b64decode(model_bytes)
    bundle = joblib.load(io.BytesIO(blob))
    pipeline = bundle["pipeline"]
    le = bundle.get("label_encoder")
    target_classes = bundle.get("target_classes", [])

    # Build a single-row DataFrame preserving column order from feature_values
    row = pd.DataFrame([feature_values])

    # Coerce numeric strings to numbers for numeric-looking columns
    for col in row.columns:
        val = row[col].iloc[0]
        if isinstance(val, str):
            try:
                row[col] = float(val)
            except ValueError:
                pass

    # ── DateTime feature extraction (mirrors train_models._train_one) ─────────
    _dt_col_names = [c for c in row.columns if pd.api.types.is_datetime64_any_dtype(row[c])]
    for _col in list(row.columns):
        if _col not in _dt_col_names and row[_col].dtype == object:
            try:
                _parsed = pd.to_datetime(row[_col], errors="coerce")
                if _parsed.notna().mean() > 0.8:
                    row[_col] = _parsed
                    _dt_col_names.append(_col)
            except Exception:
                pass
    for _col in _dt_col_names:
        try:
            _dt = pd.to_datetime(row[_col], errors="coerce")
            row[f"__dt_year_{_col}"] = _dt.dt.year.astype("float32").fillna(0)
            row[f"__dt_month_{_col}"] = _dt.dt.month.astype("float32").fillna(0)
            row[f"__dt_day_{_col}"] = _dt.dt.day.astype("float32").fillna(0)
            row[f"__dt_dow_{_col}"] = _dt.dt.dayofweek.astype("float32").fillna(0)
            row[f"__dt_doy_{_col}"] = _dt.dt.dayofyear.astype("float32").fillna(0)
        except Exception:
            pass
        row = row.drop(columns=[_col])

    is_regression = task_type == "regression"
    is_clustering = task_type == "clustering"
    is_anomaly = task_type == "anomaly_detection"
    is_classification = not (is_regression or is_clustering or is_anomaly)

    prediction: Any = None
    probabilities: dict[str, float] | None = None
    anomaly: bool | None = None
    cluster: int | None = None

    pred_raw = pipeline.predict(row)

    if is_regression:
        prediction = float(pred_raw[0])

    elif is_clustering:
        cluster = int(pred_raw[0])
        prediction = f"Cluster {cluster}"

    elif is_anomaly:
        score = int(pred_raw[0])
        anomaly = score == -1
        prediction = "Anomaly" if anomaly else "Normal"

    elif is_classification:
        pred_encoded = int(pred_raw[0])
        if le is not None and target_classes:
            prediction = str(le.inverse_transform([pred_encoded])[0])
        else:
            prediction = str(pred_encoded)

        if hasattr(pipeline, "predict_proba"):
            try:
                proba = pipeline.predict_proba(row)[0]
                if target_classes:
                    probabilities = {cls: round(float(p), 4) for cls, p in zip(target_classes, proba)}
                else:
                    probabilities = {str(i): round(float(p), 4) for i, p in enumerate(proba)}
            except Exception:
                pass

    return {
        "prediction": prediction,
        "probabilities": probabilities,
        "anomaly": anomaly,
        "cluster": cluster,
    }
