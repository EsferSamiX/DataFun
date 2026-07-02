"""
Pipeline router — step-by-step ML pipeline endpoints.

Routes:
  POST /api/pipeline/{profile_id}/preprocess   — apply preprocessing ops + re-profile
  POST /api/pipeline/{profile_id}/suggest      — get rule-based model suggestions
  POST /api/pipeline/{profile_id}/train        — train selected models
  GET  /api/pipeline/{profile_id}/models       — list trained models for a profile
  GET  /api/pipeline/models/{model_id}         — get a single trained model's metadata
  POST /api/pipeline/models/{model_id}/predict — run inference on a trained model
"""

import base64
import logging
import traceback
import uuid
from typing import Annotated

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_user
from core.mcp_client import (
    call_preprocess_dataset,
    call_profile_dataset,
    call_reprofile_dataset,
    call_run_inference,
    call_suggest_models,
    call_train_models,
)
from db.models import Profile, Suggestion, TrainedModel, User
from db.postgres import get_db

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


# ── Request / response models ─────────────────────────────────────────────────

class PreprocessRequest(BaseModel):
    operations: list[dict]  # list of op dicts, e.g. [{"op": "drop_duplicates"}, ...]


class SuggestRequest(BaseModel):
    max_suggestions: int = 5
    target_column: str | None = None


class TrainRequest(BaseModel):
    model_names: list[str]  # e.g. ["random_forest", "xgboost"]
    target_column: str | None = None  # overrides auto-detected target


class PredictRequest(BaseModel):
    feature_values: dict  # {col_name: value}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_profile_or_404(
    profile_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> Profile:
    result = await db.execute(
        select(Profile).where(Profile.id == profile_id, Profile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    return profile


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/{profile_id}/preprocess")
async def preprocess_profile(
    profile_id: uuid.UUID,
    body: PreprocessRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Apply preprocessing ops to the stored raw dataset, then re-profile it."""
    profile = await _get_profile_or_404(profile_id, current_user, db)

    if profile.raw_data is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No raw dataset stored for this profile. Re-upload the file.",
        )

    encoded = base64.b64encode(profile.raw_data).decode()

    # Call MCP preprocess tool
    # Get target_column early so we can protect it during preprocessing
    _ta = (profile.result or {}).get("target_analysis") or {}
    _target_col = _ta.get("column") if isinstance(_ta, dict) else None

    try:
        preprocess_result = await call_preprocess_dataset(
            encoded, profile.file_name, body.operations,
            target_column=_target_col,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Preprocessing failed: {exc}")

    processed_bytes_b64 = preprocess_result["processed_bytes"]
    processed_bytes = base64.b64decode(processed_bytes_b64)

    # Re-profile the cleaned data so stats (duplicate_rows, missing_cells, num_rows, etc.)
    # reflect the preprocessed dataset, not the original.
    try:
        reprofile_result = await call_reprofile_dataset(
            processed_bytes_b64, "preprocessed.csv", target_column=_target_col
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Re-profile failed: {exc}")

    # Merge: take fresh stats from reprofile, preserve quality_score/grade/plots/recommendations
    # from the original so we don't lose computed values not in the lightweight reprofile.
    original = dict(profile.result or {})
    original_ta = original.get("target_analysis") or {}

    # Preserve manually-set fields in target_analysis
    new_ta = dict(reprofile_result.get("target_analysis") or {})
    if original_ta.get("column"):
        new_ta["column"] = original_ta["column"]
    if original_ta.get("task_type"):
        new_ta["task_type"] = original_ta["task_type"]
    if original_ta.get("time_column"):
        new_ta["time_column"] = original_ta["time_column"]

    updated_result = {
        **original,
        "num_rows": reprofile_result["num_rows"],
        "num_columns": reprofile_result["num_columns"],
        "columns": reprofile_result["columns"],
        "correlations": reprofile_result["correlations"],
        "missing_cells": reprofile_result["missing_cells"],
        "missing_cells_pct": reprofile_result["missing_cells_pct"],
        "duplicate_rows": reprofile_result["duplicate_rows"],
        "duplicate_rows_pct": reprofile_result["duplicate_rows_pct"],
        "target_analysis": new_ta,
    }

    # Persist preprocessed bytes, updated profile result, and preprocessing summary
    profile.raw_data = processed_bytes
    profile.num_rows = reprofile_result["num_rows"]
    profile.num_columns = reprofile_result["num_columns"]
    profile.result = updated_result
    profile.preprocessing_ops = {
        "operations": body.operations,
        "ops_applied": preprocess_result.get("ops_applied", []),
        "shape_before": preprocess_result.get("shape_before"),
        "shape_after": preprocess_result.get("shape_after"),
        "missing_before": preprocess_result.get("missing_before"),
        "missing_after": preprocess_result.get("missing_after"),
    }

    await db.commit()

    # Merge DB-level fields so the frontend gets the same shape as GET /profile/{id}
    merged_profile = {
        "profile_id": str(profile.id),
        "file_name": profile.file_name,
        "file_format": profile.file_format,
        "file_size": profile.file_size,
        "num_rows": profile.num_rows,
        "num_columns": profile.num_columns,
        "has_raw_data": profile.raw_data is not None,
        **updated_result,
    }

    return {
        "profile_id": str(profile.id),
        "preprocessing": profile.preprocessing_ops,
        "preview": preprocess_result.get("preview", []),
        "profile": merged_profile,
    }


@router.post("/{profile_id}/suggest")
async def suggest_pipeline_models(
    profile_id: uuid.UUID,
    body: SuggestRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Get rule-based model suggestions for this profile."""
    profile = await _get_profile_or_404(profile_id, current_user, db)

    profile_result_for_mcp = dict(profile.result or {})
    if body.target_column:
        ta = dict(profile_result_for_mcp.get("target_analysis") or {})
        ta["column"] = body.target_column
        profile_result_for_mcp["target_analysis"] = ta

    try:
        suggestion_result = await call_suggest_models(
            profile_result_for_mcp, max_suggestions=body.max_suggestions
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Suggestion failed: {exc}")

    # Upsert Suggestion row
    result = await db.execute(
        select(Suggestion).where(
            Suggestion.profile_id == profile_id,
            Suggestion.user_id == current_user.id,
        )
    )
    db_suggestion = result.scalar_one_or_none()

    if db_suggestion is None:
        db_suggestion = Suggestion(
            id=uuid.uuid4(),
            profile_id=profile_id,
            user_id=current_user.id,
            task_type=suggestion_result["task_type"],
            result=suggestion_result,
        )
        db.add(db_suggestion)
    else:
        db_suggestion.task_type = suggestion_result["task_type"]
        db_suggestion.result = suggestion_result

    await db.commit()

    return {
        "suggestion_id": str(db_suggestion.id),
        "profile_id": str(profile_id),
        **suggestion_result,
    }


@router.post("/{profile_id}/train")
async def train_pipeline_models(
    profile_id: uuid.UUID,
    body: TrainRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Train selected models on the profile's dataset."""
    try:
        return await _train_pipeline_models_inner(profile_id, body, current_user, db)
    except Exception:
        logger.error("TRAIN 500:\n%s", traceback.format_exc())
        raise


async def _train_pipeline_models_inner(profile_id, body, current_user, db):
    profile = await _get_profile_or_404(profile_id, current_user, db)

    if profile.raw_data is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No raw dataset stored. Re-upload the file.",
        )

    if not body.model_names:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No models specified.")

    # Determine task_type from stored suggestion or profile
    result = await db.execute(
        select(Suggestion).where(
            Suggestion.profile_id == profile_id,
            Suggestion.user_id == current_user.id,
        )
    )
    suggestion = result.scalar_one_or_none()
    task_type = (suggestion.task_type if suggestion else None) or \
                (profile.result or {}).get("target_analysis", {}).get("task_type", "binary_classification")

    # Determine target column
    target_column = body.target_column or (
        (profile.result or {}).get("target_analysis", {}).get("column")
    )

    # Detect if data was already scaled in the preprocess step (to avoid double-scaling)
    _prep_ops = profile.preprocessing_ops or {}
    _ops_applied = _prep_ops.get("ops_applied", [])
    already_scaled = any(
        "scale" in str(op).lower() or "standard" in str(op).lower() or "minmax" in str(op).lower()
        for op in _ops_applied
    )

    # Pass known feature columns from the profile so spurious columns are dropped
    _profile_cols = (profile.result or {}).get("columns", [])
    feature_columns = [c["name"] for c in _profile_cols if isinstance(c, dict) and "name" in c] or None

    encoded = base64.b64encode(profile.raw_data).decode()

    # After preprocessing, raw_data is always CSV bytes regardless of the original
    # file format — use a .csv filename so the MCP format_loader reads it correctly
    # instead of dispatching to pd.read_excel() on CSV data.
    train_filename = "preprocessed.csv" if profile.preprocessing_ops else profile.file_name

    try:
        train_result = await call_train_models(
            encoded,
            train_filename,
            body.model_names,
            task_type,
            target_column=target_column,
            already_scaled=already_scaled,
            feature_columns=feature_columns,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Training failed: {exc}")

    saved_models = []
    for model_result in train_result.get("results", []):
        if model_result.get("error"):
            saved_models.append({
                "model_name": model_result["model_name"],
                "error": model_result["error"],
            })
            continue

        model_bytes = base64.b64decode(model_result["model_bytes"]) if model_result.get("model_bytes") else b""

        db_model = TrainedModel(
            id=uuid.uuid4(),
            profile_id=profile_id,
            user_id=current_user.id,
            model_name=model_result["model_name"],
            task_type=model_result["task_type"],
            metrics=model_result["metrics"],
            feature_names=model_result["feature_names"],
            target_classes=model_result.get("target_classes"),
            confusion_matrix_png=model_result.get("confusion_matrix_png"),
            feature_importance_png=model_result.get("feature_importance_png"),
            model_data=model_bytes,
            training_time_s=model_result.get("training_time_s"),
            roc_curve_png=model_result.get("roc_curve_png"),
            residual_plot_png=model_result.get("residual_plot_png"),
            ts_actual_vs_predicted_png=model_result.get("ts_actual_vs_predicted_png"),
            learning_curve_png=model_result.get("learning_curve_png"),
            classification_report_text=model_result.get("classification_report_text"),
            test_rows=model_result.get("test_rows"),
            target_column=model_result.get("target_column"),
        )
        db.add(db_model)
        saved_models.append({
            "model_id": str(db_model.id),
            "model_name": db_model.model_name,
            "task_type": db_model.task_type,
            "metrics": db_model.metrics,
            "target_classes": db_model.target_classes,
            "feature_names": db_model.feature_names,
            "confusion_matrix_png": db_model.confusion_matrix_png,
            "feature_importance_png": db_model.feature_importance_png,
            "training_time_s": db_model.training_time_s,
            "roc_curve_png": db_model.roc_curve_png,
            "residual_plot_png": db_model.residual_plot_png,
            "ts_actual_vs_predicted_png": db_model.ts_actual_vs_predicted_png,
            "learning_curve_png": db_model.learning_curve_png,
            "classification_report_text": db_model.classification_report_text,
            "test_rows": db_model.test_rows,
            "target_column": db_model.target_column,
        })

    await db.commit()

    return {"profile_id": str(profile_id), "models": saved_models}


@router.get("/{profile_id}/models")
async def list_trained_models(
    profile_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """List all trained models for a profile (without large binary fields)."""
    await _get_profile_or_404(profile_id, current_user, db)

    result = await db.execute(
        select(TrainedModel).where(
            TrainedModel.profile_id == profile_id,
            TrainedModel.user_id == current_user.id,
        )
    )
    models = result.scalars().all()

    return {
        "profile_id": str(profile_id),
        "models": [
            {
                "model_id": str(m.id),
                "model_name": m.model_name,
                "task_type": m.task_type,
                "metrics": m.metrics,
                "target_classes": m.target_classes,
                "feature_names": m.feature_names,
                "confusion_matrix_png": m.confusion_matrix_png,
                "feature_importance_png": m.feature_importance_png,
                "training_time_s": m.training_time_s,
                "roc_curve_png": m.roc_curve_png,
                "residual_plot_png": m.residual_plot_png,
                "ts_actual_vs_predicted_png": m.ts_actual_vs_predicted_png,
                "learning_curve_png": m.learning_curve_png,
                "classification_report_text": m.classification_report_text,
                "test_rows": m.test_rows,
                "target_column": m.target_column,
                "created_at": m.created_at.isoformat(),
            }
            for m in models
        ],
    }


@router.post("/models/{model_id}/predict")
async def predict(
    model_id: uuid.UUID,
    body: PredictRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Run inference on a trained model."""
    result = await db.execute(
        select(TrainedModel).where(
            TrainedModel.id == model_id,
            TrainedModel.user_id == current_user.id,
        )
    )
    model = result.scalar_one_or_none()
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trained model not found.")

    model_bytes_b64 = base64.b64encode(model.model_data).decode()

    try:
        inference_result = await call_run_inference(
            model_bytes_b64,
            body.feature_values,
            model.task_type,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Inference failed: {exc}")

    return {
        "model_id": str(model_id),
        "model_name": model.model_name,
        "task_type": model.task_type,
        **inference_result,
    }
