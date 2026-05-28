"""AdaptiveUI Blueprint Service.

POST /blueprint receives a DOM Skeleton (text/PII stripped on the client)
and returns a Blueprint of resilient-anchor transforms. The model output
is validated against a strict Pydantic schema before responding; if the
LLM is unreachable or its output is malformed, a deterministic heuristic
takes over so the loop never silently breaks.
"""

from __future__ import annotations

import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .cache import cache
from .heuristic import generate_heuristic_transforms
from .llm import OLLAMA_MODEL, call_llm
from .schema import (
    Blueprint,
    BlueprintMetadata,
    BlueprintRequest,
    BlueprintResponse,
)

app = FastAPI(title="AdaptiveUI Blueprint Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, object]:
    return {"ok": True, "service": "blueprint", "model": OLLAMA_MODEL}


@app.post("/blueprint", response_model=BlueprintResponse)
async def post_blueprint(req: BlueprintRequest) -> BlueprintResponse:
    cached = await cache.get(req.structuralHash)
    if cached is not None:
        return BlueprintResponse(blueprint=cached, source="cache")

    transforms = await call_llm(req.skeleton)
    source: str
    if transforms:
        source = "llm"
    else:
        transforms = generate_heuristic_transforms(req.skeleton, req.structuralHash)
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
    return BlueprintResponse(blueprint=blueprint, source=source)  # type: ignore[arg-type]
