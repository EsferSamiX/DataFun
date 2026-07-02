import json
from typing import Any

import redis.asyncio as aioredis

from core.config import settings

_redis_client: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    """Return a singleton Redis async client."""
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


# ── Profile cache ──────────────────────────────────────────────────────────────

def _profile_key(user_id: str, file_hash: str) -> str:
    return f"profile:{user_id}:{file_hash}"


async def get_profile_cache(user_id: str, file_hash: str) -> dict | None:
    """Return cached ProfileResult for this user+file_hash, or None on miss."""
    client = get_redis()
    raw = await client.get(_profile_key(user_id, file_hash))
    if raw is None:
        return None
    return json.loads(raw)


async def set_profile_cache(
    user_id: str, file_hash: str, result: dict, ttl: int = settings.PROFILE_CACHE_TTL_SECONDS
) -> None:
    """Store ProfileResult in Redis with the given TTL (seconds)."""
    client = get_redis()
    await client.setex(_profile_key(user_id, file_hash), ttl, json.dumps(result))


# ── Suggestion cache ───────────────────────────────────────────────────────────

def _suggestion_key(user_id: str, file_hash: str) -> str:
    return f"suggest:{user_id}:{file_hash}"


async def get_suggestion_cache(user_id: str, file_hash: str) -> dict | None:
    """Return cached SuggestionResult for this user+file_hash, or None on miss."""
    client = get_redis()
    raw = await client.get(_suggestion_key(user_id, file_hash))
    if raw is None:
        return None
    return json.loads(raw)


async def set_suggestion_cache(
    user_id: str, file_hash: str, result: dict, ttl: int = settings.PROFILE_CACHE_TTL_SECONDS
) -> None:
    """Store SuggestionResult in Redis with the given TTL (seconds)."""
    client = get_redis()
    await client.setex(_suggestion_key(user_id, file_hash), ttl, json.dumps(result))


# ── LLM cache ──────────────────────────────────────────────────────────────────

def _llm_key(prompt_hash: str) -> str:
    return f"llm:{prompt_hash}"


async def get_llm_cache(prompt_hash: str) -> str | None:
    """Return cached LLM response string, or None on miss."""
    client = get_redis()
    return await client.get(_llm_key(prompt_hash))


async def set_llm_cache(prompt_hash: str, result: str, ttl: int = 3600) -> None:
    """Store LLM response string in Redis with given TTL (default 1h)."""
    client = get_redis()
    await client.setex(_llm_key(prompt_hash), ttl, result)
