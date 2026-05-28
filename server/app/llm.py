"""Optional LLM bridge via Ollama. Returns None on any failure, leaving the
caller to fall back to the deterministic heuristic.
"""

from __future__ import annotations

import json
import os
from typing import List, Optional

import httpx

from .prompt import build_prompt
from .schema import BlueprintTransform, SkeletonNode

OLLAMA_URL = os.environ.get("OLLAMA_URL", "")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_TIMEOUT = float(os.environ.get("OLLAMA_TIMEOUT", "30"))
OLLAMA_DISABLED = os.environ.get("OLLAMA_DISABLED") == "1"


async def call_llm(skeleton: SkeletonNode) -> Optional[List[BlueprintTransform]]:
    if OLLAMA_DISABLED or not OLLAMA_URL:
        return None
    skeleton_json = skeleton.model_dump_json(exclude_none=True)
    prompt = build_prompt(skeleton_json)
    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return None

    raw = data.get("response") if isinstance(data, dict) else None
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parse_transforms(payload)


def parse_transforms(payload: object) -> Optional[List[BlueprintTransform]]:
    if not isinstance(payload, dict):
        return None
    items = payload.get("transforms")
    if not isinstance(items, list):
        return None
    parsed: List[BlueprintTransform] = []
    for raw in items:
        try:
            parsed.append(BlueprintTransform.model_validate(raw))
        except Exception:
            continue
    return parsed if parsed else None
