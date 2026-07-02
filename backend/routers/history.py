"""
History and similarity search router.

Routes:
  GET /api/profile/history      — paginated list of user's past profiles
  GET /api/similar/{profile_id} — 5 most similar profiles via pgvector cosine search
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_user
from db.models import Profile, ProfileEmbedding, User
from db.postgres import get_db

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/profile/history")
async def list_profile_history(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    """
    Return a paginated list of the current user's past profiles.

    Results are ordered by created_at descending (most recent first).
    """
    stmt = (
        select(Profile)
        .where(Profile.user_id == current_user.id)
        .order_by(Profile.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    profiles = result.scalars().all()

    return {
        "profiles": [
            {
                "profile_id": str(p.id),
                "file_name": p.file_name,
                "file_format": p.file_format,
                "file_size": p.file_size,
                "num_rows": p.num_rows,
                "num_columns": p.num_columns,
                "created_at": p.created_at.isoformat(),
            }
            for p in profiles
        ],
        "limit": limit,
        "offset": offset,
    }


@router.get("/similar/{profile_id}")
async def find_similar_profiles(
    profile_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Find the 5 most similar profiles to the given one using pgvector cosine distance.

    Similarity search is scoped to the current user's profiles only.
    Requires that the target profile has a stored embedding.
    """
    # Verify ownership and existence of target profile
    profile_result = await db.execute(
        select(Profile).where(
            Profile.id == profile_id,
            Profile.user_id == current_user.id,
        )
    )
    profile = profile_result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    # Fetch the embedding for the target profile
    emb_result = await db.execute(
        select(ProfileEmbedding).where(ProfileEmbedding.id == profile_id)
    )
    target_embedding = emb_result.scalar_one_or_none()
    if target_embedding is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No embedding found for this profile. Similarity search unavailable.",
        )

    # pgvector cosine distance query scoped to current user, excluding the target profile
    # Uses <=> operator for cosine distance (lower = more similar)
    similar_stmt = text(
        """
        SELECT p.id, p.file_name, p.file_format, p.file_size, p.num_rows, p.num_columns,
               p.created_at,
               pe.embedding <=> CAST(:target_vec AS vector) AS distance
        FROM profile_embeddings pe
        JOIN profiles p ON p.id = pe.id
        WHERE p.user_id = :user_id
          AND pe.id != :profile_id
        ORDER BY pe.embedding <=> CAST(:target_vec AS vector)
        LIMIT 5
        """
    )

    vector_list = target_embedding.embedding
    # Format the vector as a PostgreSQL array literal
    vector_str = "[" + ",".join(str(v) for v in vector_list) + "]"

    rows = await db.execute(
        similar_stmt,
        {
            "target_vec": vector_str,
            "user_id": current_user.id,
            "profile_id": profile_id,
        },
    )
    similar_profiles = rows.fetchall()

    return {
        "profile_id": str(profile_id),
        "similar": [
            {
                "profile_id": str(row.id),
                "file_name": row.file_name,
                "file_format": row.file_format,
                "file_size": row.file_size,
                "num_rows": row.num_rows,
                "num_columns": row.num_columns,
                "created_at": row.created_at.isoformat(),
                "similarity_score": round(1.0 - float(row.distance), 4),
            }
            for row in similar_profiles
        ],
    }
