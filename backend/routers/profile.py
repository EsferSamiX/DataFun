"""
Profile router — file upload, profiling, and result retrieval.

Routes:
  POST /api/profile                    — upload + profile a dataset
  GET  /api/profile/{profile_id}       — fetch stored profile result
  GET  /api/profile/{profile_id}/suggest — fetch stored suggestion result
"""

import hashlib
import logging
import uuid
from typing import Annotated

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_user
from core.cache import (
    get_profile_cache,
    get_suggestion_cache,
    set_profile_cache,
    set_suggestion_cache,
)
from core.config import settings
from core.embeddings import embed_profile, profile_to_text
from core.mcp_client import call_profile_dataset
from db.models import Profile, ProfileEmbedding, Suggestion, TrainedModel, User
from db.postgres import get_db

router = APIRouter(prefix="/api", tags=["profile"])


# ── Helper ─────────────────────────────────────────────────────────────────────

def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/profile", status_code=status.HTTP_201_CREATED)
async def upload_and_profile(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    target_column: str | None = Form(default=None),
    depth: str = Form(default="standard"),
) -> dict:
    """
    Upload a dataset file, run profiling + model suggestion via MCP, store results.

    Flow:
      1. Validate file size
      2. Hash file bytes → SHA-256
      3. Check Redis cache (profile + suggestion) — return early on hit
      4. Call MCP profile_dataset tool
      5. Call MCP suggest_model tool
      6. Store Profile + Suggestion rows in Postgres
      7. Embed profile summary → store in pgvector
      8. Cache both results in Redis
    """
    # Read and validate file size
    file_bytes = await file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.MAX_UPLOAD_SIZE_MB} MB.",
        )

    filename = file.filename or "upload"
    file_hash = _sha256(file_bytes)
    user_id_str = str(current_user.id)

    # Check Redis cache
    cached_profile = await get_profile_cache(user_id_str, file_hash)
    cached_suggestion = await get_suggestion_cache(user_id_str, file_hash)

    if cached_profile and cached_suggestion:
        # Look up profile_id from DB (needed for frontend routing)
        result = await db.execute(
            select(Profile).where(
                Profile.user_id == current_user.id,
                Profile.file_hash == file_hash,
            )
        )
        existing_profile = result.scalar_one_or_none()
        if existing_profile:
            return {
                "profile_id": str(existing_profile.id),
                "profile": cached_profile,
                "suggestion": cached_suggestion,
                "cached": True,
            }

    # Call MCP tool 1 — profile_dataset
    kwargs: dict = {}
    if target_column:
        kwargs["target_column"] = target_column
    if depth:
        kwargs["depth"] = depth

    try:
        profile_result = await call_profile_dataset(file_bytes, filename, **kwargs)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Profiling failed: {exc}",
        )

    # suggest_model is disabled (LiteLLM provider not configured)
    suggestion_result = {
        "task_type": "unknown",
        "problem_summary": "",
        "suggestions": [],
        "starter_code": "",
        "concerns": [],
        "evaluation_metrics": [],
        "preprocessing_steps": [],
    }

    # Detect file format from extension
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "unknown"

    # Extract metadata from profile result (may be absent — graceful fallback)
    num_rows = profile_result.get("num_rows")
    num_columns = profile_result.get("num_columns")
    task_type = suggestion_result.get("task_type", "unknown")

    # Store Profile in Postgres (upsert by unique constraint user_id+file_hash)
    result = await db.execute(
        select(Profile).where(
            Profile.user_id == current_user.id,
            Profile.file_hash == file_hash,
        )
    )
    db_profile = result.scalar_one_or_none()

    if db_profile is None:
        db_profile = Profile(
            id=uuid.uuid4(),
            user_id=current_user.id,
            file_name=filename,
            file_hash=file_hash,
            file_format=ext,
            file_size=len(file_bytes),
            num_rows=num_rows,
            num_columns=num_columns,
            result=profile_result,
            raw_data=file_bytes,
        )
        db.add(db_profile)
    else:
        # Always overwrite with fresh profiler result so stale/corrupted data is replaced
        db_profile.num_rows = num_rows
        db_profile.num_columns = num_columns
        db_profile.result = profile_result
        db_profile.raw_data = file_bytes
    await db.flush()

    # Store Suggestion linked to Profile
    result = await db.execute(
        select(Suggestion).where(Suggestion.profile_id == db_profile.id)
    )
    db_suggestion = result.scalar_one_or_none()

    if db_suggestion is None:
        db_suggestion = Suggestion(
            id=uuid.uuid4(),
            profile_id=db_profile.id,
            user_id=current_user.id,
            task_type=task_type,
            result=suggestion_result,
        )
        db.add(db_suggestion)
    else:
        db_suggestion.task_type = task_type
        db_suggestion.result = suggestion_result
    await db.flush()

    # Embed profile summary → store in pgvector
    result = await db.execute(
        select(ProfileEmbedding).where(ProfileEmbedding.id == db_profile.id)
    )
    existing_embedding = result.scalar_one_or_none()

    if existing_embedding is None:
        try:
            summary_text = profile_to_text(profile_result)
            vector = await embed_profile(summary_text)
            embedding_row = ProfileEmbedding(id=db_profile.id, embedding=vector)
            db.add(embedding_row)
        except Exception:
            # Non-fatal — similarity search won't work but core flow continues
            pass

    # Cache both results in Redis
    await set_profile_cache(user_id_str, file_hash, profile_result)
    await set_suggestion_cache(user_id_str, file_hash, suggestion_result)

    await db.commit()

    return {
        "profile_id": str(db_profile.id),
        "profile": profile_result,
        "suggestion": suggestion_result,
        "cached": False,
    }


@router.get("/profile/{profile_id}")
async def get_profile(
    profile_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Fetch a stored profile result by ID (must belong to current user)."""
    result = await db.execute(
        select(Profile).where(
            Profile.id == profile_id,
            Profile.user_id == current_user.id,
        )
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    # Auto-generate target distribution plot if missing but target column is known
    result_data = dict(profile.result or {})
    ta = result_data.get("target_analysis") or {}
    target_col = ta.get("column")
    plots = dict(result_data.get("plots") or {})
    if target_col and not plots.get("target_distribution") and profile.raw_data:
        try:
            import io as _io
            import pandas as _pd
            from core.plots import target_distribution_plot as _tdp
            from sqlalchemy.orm.attributes import flag_modified
            _df = _pd.read_csv(_io.BytesIO(profile.raw_data))
            new_plot = _tdp(_df, target_col)
            if new_plot:
                plots["target_distribution"] = new_plot
                result_data["plots"] = plots
                profile.result = result_data
                flag_modified(profile, "result")
                await db.commit()
        except Exception as e:
            logger.warning("auto-generate target plot failed: %s", e)

    return {
        "profile_id": str(profile.id),
        "file_name": profile.file_name,
        "file_format": profile.file_format,
        "file_size": profile.file_size,
        "num_rows": profile.num_rows,
        "num_columns": profile.num_columns,
        "created_at": profile.created_at.isoformat(),
        "has_raw_data": profile.raw_data is not None,
        "result": result_data,
    }


@router.get("/profile/{profile_id}/suggest")
async def get_suggestion(
    profile_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Fetch the stored suggestion result for a profile (must belong to current user)."""
    # Verify profile ownership first
    profile_result = await db.execute(
        select(Profile).where(
            Profile.id == profile_id,
            Profile.user_id == current_user.id,
        )
    )
    profile = profile_result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    suggestion_result = await db.execute(
        select(Suggestion).where(
            Suggestion.profile_id == profile_id,
            Suggestion.user_id == current_user.id,
        )
    )
    suggestion = suggestion_result.scalar_one_or_none()
    if suggestion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Suggestion not found."
        )

    return {
        "suggestion_id": str(suggestion.id),
        "profile_id": str(profile_id),
        "task_type": suggestion.task_type,
        "created_at": suggestion.created_at.isoformat(),
        "result": suggestion.result,
    }


# ── Target column override ────────────────────────────────────────────────────

class TargetOverrideRequest(BaseModel):
    target_column: str
    task_type: str
    time_column: str | None = None


@router.patch("/profile/{profile_id}/target")
async def override_target(
    profile_id: uuid.UUID,
    body: TargetOverrideRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    result = await db.execute(
        select(Profile).where(Profile.id == profile_id, Profile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    updated = dict(profile.result or {})
    ta = dict(updated.get("target_analysis") or {})
    ta["column"] = body.target_column
    ta["task_type"] = body.task_type
    if body.time_column is not None:
        ta["time_column"] = body.time_column
    elif "time_column" in ta and body.task_type != "time_series":
        del ta["time_column"]
    updated["target_analysis"] = ta

    from sqlalchemy.orm.attributes import flag_modified
    profile.result = updated
    flag_modified(profile, "result")
    await db.commit()
    return {
        "target_column": body.target_column,
        "task_type": body.task_type,
        "time_column": body.time_column,
    }


@router.delete("/profile/{profile_id}", status_code=204)
async def delete_profile(
    profile_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Delete a profile and all associated data (models, suggestions, embedding)."""
    result = await db.execute(
        select(Profile).where(
            Profile.id == profile_id,
            Profile.user_id == current_user.id,
        )
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    for model_cls in (TrainedModel, Suggestion):
        rows = await db.execute(
            select(model_cls).where(model_cls.profile_id == profile_id)
        )
        for row in rows.scalars().all():
            await db.delete(row)

    emb = await db.execute(select(ProfileEmbedding).where(ProfileEmbedding.id == profile_id))
    emb_row = emb.scalar_one_or_none()
    if emb_row:
        await db.delete(emb_row)

    await db.delete(profile)
    await db.commit()
    return Response(status_code=204)
