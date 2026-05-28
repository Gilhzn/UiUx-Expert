"""AdaptiveUI Blueprint Service.

POST /blueprint receives a DOM Skeleton (text/PII stripped on the client)
and returns a Blueprint of resilient-anchor transforms. The model output
is validated against a strict Pydantic schema before responding; if the
LLM is unreachable or its output is malformed, a deterministic heuristic
takes over so the loop never silently breaks.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import metrics
from .auth import auth_middleware
from .cache import cache
from .db import init_db, shutdown_db, session_scope
from .heuristic import generate_heuristic_transforms
from .llm import OLLAMA_MODEL, call_llm
from .models import BlueprintHistory, FeedbackHistory
from .quarantine import QUARANTINE_THRESHOLD, store as quarantine_store
from .schema import (
    Blueprint,
    BlueprintMetadata,
    BlueprintRequest,
    BlueprintResponse,
)
from .sync import router as sync_router

logger = logging.getLogger("adaptiveui.api")


from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    yield
    await shutdown_db()


app = FastAPI(
    title="AdaptiveUI Blueprint Service",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["x-api-key", "content-type"],
)

app.middleware("http")(auth_middleware)
app.include_router(sync_router)


@app.get("/health")
async def health() -> dict[str, object]:
    return {"ok": True, "service": "blueprint", "model": OLLAMA_MODEL}


@app.get("/metrics")
async def metrics_endpoint() -> Response:
    body, content_type = metrics.render()
    return Response(content=body, media_type=content_type)


@app.post("/blueprint", response_model=BlueprintResponse)
async def post_blueprint(req: BlueprintRequest) -> BlueprintResponse:
    start = time.monotonic()
    try:
        if await quarantine_store.is_quarantined(req.structuralHash):
            logger.info("blueprint quarantined hash=%s", req.structuralHash)
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="blueprint quarantined; client should not apply",
            )

        cached = await cache.get(req.structuralHash)
        if cached is not None:
            metrics.CACHE_HITS_TOTAL.inc()
            metrics.REQUESTS_TOTAL.labels(source="cache").inc()
            return BlueprintResponse(blueprint=cached, source="cache")

        transforms = await call_llm(req.skeleton)
        source: str
        if transforms:
            metrics.LLM_CALLS_TOTAL.labels(outcome="ok").inc()
            source = "llm"
        else:
            metrics.LLM_CALLS_TOTAL.labels(outcome="fallback").inc()
            transforms = generate_heuristic_transforms(
                req.skeleton, req.structuralHash
            )
            source = "heuristic"

        blueprint = Blueprint(
            structuralHash=req.structuralHash,
            transforms=transforms,
            metadata=BlueprintMetadata(
                createdAt=int(time.time() * 1000),
                model=OLLAMA_MODEL if source == "llm" else None,
                source=source,  # type: ignore[arg-type]
            ),
        )
        await cache.set(req.structuralHash, blueprint)
        await _persist_blueprint(req.structuralHash, source, blueprint)
        metrics.REQUESTS_TOTAL.labels(source=source).inc()
        return BlueprintResponse(blueprint=blueprint, source=source)  # type: ignore[arg-type]
    finally:
        metrics.REQUEST_LATENCY_SECONDS.observe(time.monotonic() - start)


async def _persist_blueprint(structural_hash: str, source: str, blueprint: Blueprint) -> None:
    try:
        async with session_scope() as session:
            session.add(
                BlueprintHistory(
                    structural_hash=structural_hash,
                    source=source,
                    blueprint_json=blueprint.model_dump_json(),
                )
            )
    except Exception:  # don't fail the request if persistence stumbles
        logger.exception("failed to persist blueprint history")


class FeedbackRequest(BaseModel):
    structuralHash: str
    verifierFailed: bool = True
    issues: list[str] = []


class FeedbackResponse(BaseModel):
    failures: int
    quarantined: bool
    threshold: int


@app.post("/blueprint/feedback", response_model=FeedbackResponse)
async def post_feedback(req: FeedbackRequest) -> FeedbackResponse:
    if not req.verifierFailed:
        metrics.FEEDBACK_TOTAL.labels(outcome="ok").inc()
        return FeedbackResponse(failures=0, quarantined=False, threshold=QUARANTINE_THRESHOLD)
    record = await quarantine_store.record_failure(req.structuralHash)
    metrics.FEEDBACK_TOTAL.labels(outcome="fail").inc()
    if record.quarantined:
        metrics.QUARANTINE_TOTAL.inc()
        logger.warning(
            "blueprint quarantined hash=%s after %d failures", req.structuralHash, record.failures
        )
    try:
        async with session_scope() as session:
            session.add(
                FeedbackHistory(
                    structural_hash=req.structuralHash,
                    verifier_failed=True,
                    issues=";".join(req.issues) if req.issues else None,
                )
            )
    except Exception:
        logger.exception("failed to persist feedback")
    return FeedbackResponse(
        failures=record.failures,
        quarantined=record.quarantined,
        threshold=QUARANTINE_THRESHOLD,
    )


@app.middleware("http")
async def access_log(
    request: Request, call_next: Any
) -> Response:
    start = time.monotonic()
    response = await call_next(request)
    dur_ms = int((time.monotonic() - start) * 1000)
    logger.info(
        "%s %s -> %s in %dms",
        request.method,
        request.url.path,
        response.status_code,
        dur_ms,
    )
    return response
