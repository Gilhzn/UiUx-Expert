"""API-key auth + token-bucket rate limiting.

Both are opt-in via env vars; if neither is set the service runs wide-open
as a dev convenience. Both leave a clean audit trail through structured
log lines (logger name "adaptiveui.auth").
"""

from __future__ import annotations

import logging
import os
import time
from typing import Awaitable, Callable, Optional

from fastapi import HTTPException, Request, Response, status

logger = logging.getLogger("adaptiveui.auth")

API_KEY = os.environ.get("API_KEY", "")
RATE_LIMIT_RPS = float(os.environ.get("RATE_LIMIT_RPS") or "0")
RATE_LIMIT_BURST = int(os.environ.get("RATE_LIMIT_BURST") or "20")


class TokenBucket:
    __slots__ = ("rate", "capacity", "tokens", "updated")

    def __init__(self, rate: float, capacity: int) -> None:
        self.rate = rate
        self.capacity = capacity
        self.tokens = float(capacity)
        self.updated = time.monotonic()

    def take(self) -> bool:
        now = time.monotonic()
        elapsed = now - self.updated
        self.updated = now
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False


_buckets: dict[str, TokenBucket] = {}


def _client_id(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if forwarded:
        return forwarded
    if request.client is None:
        return "unknown"
    return request.client.host


def check_api_key(request: Request) -> None:
    if not API_KEY:
        return
    presented = request.headers.get("x-api-key", "")
    if presented != API_KEY:
        logger.warning("rejected request: bad/missing X-API-Key from %s", _client_id(request))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or missing X-API-Key",
        )


def check_rate_limit(request: Request) -> None:
    if RATE_LIMIT_RPS <= 0:
        return
    key = _client_id(request)
    bucket = _buckets.get(key)
    if bucket is None:
        bucket = TokenBucket(rate=RATE_LIMIT_RPS, capacity=RATE_LIMIT_BURST)
        _buckets[key] = bucket
    if not bucket.take():
        logger.info("rate limited %s", key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="rate limit exceeded",
        )


async def auth_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    # Health, metrics: always reachable so a dead-keyed deployment is observable.
    open_paths = {"/health", "/metrics"}
    if request.url.path in open_paths:
        return await call_next(request)
    try:
        check_api_key(request)
        check_rate_limit(request)
    except HTTPException as exc:
        return Response(
            content=f'{{"detail":"{exc.detail}"}}',
            status_code=exc.status_code,
            media_type="application/json",
        )
    return await call_next(request)


def reset_buckets_for_tests() -> Optional[None]:
    _buckets.clear()
    return None
