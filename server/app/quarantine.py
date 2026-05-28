"""Server-side quarantine ledger for Blueprints that the client reports as
breaking pages. Two failures and the structural hash is locked; subsequent
requests get a fresh generation instead of the bad cached Blueprint.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Optional

try:
    import redis.asyncio as redis_async
except ImportError:
    redis_async = None  # type: ignore[assignment]

REDIS_URL = os.environ.get("REDIS_URL", "")
QUARANTINE_THRESHOLD = int(os.environ.get("BLUEPRINT_QUARANTINE_THRESHOLD", "2"))
TTL_SECONDS = 60 * 60 * 24 * 30


@dataclass
class QuarantineRecord:
    structural_hash: str
    failures: int
    quarantined: bool
    last_failure_at: int


class QuarantineStore:
    def __init__(self) -> None:
        self._memory_failures: dict[str, int] = {}
        self._memory_quarantine: dict[str, int] = {}
        self._redis = None
        if REDIS_URL and redis_async is not None:
            try:
                self._redis = redis_async.from_url(REDIS_URL, decode_responses=True)
            except Exception:
                self._redis = None

    async def is_quarantined(self, structural_hash: str) -> bool:
        if self._redis is not None:
            try:
                v = await self._redis.get(self._qkey(structural_hash))
                if v is not None:
                    return True
            except Exception:
                pass
        return structural_hash in self._memory_quarantine

    async def record_failure(self, structural_hash: str) -> QuarantineRecord:
        count = 0
        if self._redis is not None:
            try:
                count = await self._redis.incr(self._fkey(structural_hash))
                await self._redis.expire(self._fkey(structural_hash), TTL_SECONDS)
            except Exception:
                count = 0
        if count == 0:
            count = self._memory_failures.get(structural_hash, 0) + 1
            self._memory_failures[structural_hash] = count

        quarantined = count >= QUARANTINE_THRESHOLD
        if quarantined:
            await self._mark_quarantine(structural_hash)
        return QuarantineRecord(
            structural_hash=structural_hash,
            failures=count,
            quarantined=quarantined,
            last_failure_at=int(time.time() * 1000),
        )

    async def _mark_quarantine(self, structural_hash: str) -> None:
        ts = int(time.time())
        self._memory_quarantine[structural_hash] = ts
        if self._redis is not None:
            try:
                await self._redis.set(self._qkey(structural_hash), ts, ex=TTL_SECONDS)
            except Exception:
                pass

    async def clear(self) -> None:
        self._memory_failures.clear()
        self._memory_quarantine.clear()
        if self._redis is not None:
            try:
                async for key in self._redis.scan_iter("blueprint-quarantine:*"):
                    await self._redis.delete(key)
                async for key in self._redis.scan_iter("blueprint-failures:*"):
                    await self._redis.delete(key)
            except Exception:
                pass

    @staticmethod
    def _qkey(h: str) -> str:
        return f"blueprint-quarantine:{h}"

    @staticmethod
    def _fkey(h: str) -> str:
        return f"blueprint-failures:{h}"


store = QuarantineStore()
