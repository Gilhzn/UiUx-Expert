"""Layered cache for Blueprints.

Uses Redis when REDIS_URL is set, with an in-memory dict fallback so the
service works (and tests pass) without external infrastructure.
"""

from __future__ import annotations

import os
from typing import Optional

from .schema import Blueprint

REDIS_URL = os.environ.get("REDIS_URL", "")
CACHE_TTL_SECONDS = 60 * 60 * 24 * 7

try:
    import redis.asyncio as redis_async
except ImportError:
    redis_async = None  # type: ignore[assignment]


class BlueprintCache:
    def __init__(self) -> None:
        self._memory: dict[str, str] = {}
        self._redis = None
        if REDIS_URL and redis_async is not None:
            try:
                self._redis = redis_async.from_url(REDIS_URL, decode_responses=True)
            except Exception:
                self._redis = None

    async def get(self, key: str) -> Optional[Blueprint]:
        full = self._k(key)
        raw: Optional[str] = None
        if self._redis is not None:
            try:
                raw = await self._redis.get(full)
            except Exception:
                raw = None
        if raw is None:
            raw = self._memory.get(full)
        if raw is None:
            return None
        try:
            return Blueprint.model_validate_json(raw)
        except Exception:
            return None

    async def set(self, key: str, blueprint: Blueprint) -> None:
        full = self._k(key)
        raw = blueprint.model_dump_json()
        self._memory[full] = raw
        if self._redis is not None:
            try:
                await self._redis.set(full, raw, ex=CACHE_TTL_SECONDS)
            except Exception:
                pass

    async def clear(self) -> None:
        self._memory.clear()

    @staticmethod
    def _k(key: str) -> str:
        return f"blueprint:{key}"


cache = BlueprintCache()
