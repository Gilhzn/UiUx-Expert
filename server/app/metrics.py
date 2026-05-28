"""Prometheus metrics for the Blueprint service."""

from __future__ import annotations

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Histogram,
    generate_latest,
)


REGISTRY = CollectorRegistry()

REQUESTS_TOTAL = Counter(
    "adaptiveui_blueprint_requests_total",
    "Total /blueprint POST requests handled.",
    labelnames=("source",),
    registry=REGISTRY,
)

CACHE_HITS_TOTAL = Counter(
    "adaptiveui_blueprint_cache_hits_total",
    "Blueprint cache hits.",
    registry=REGISTRY,
)

LLM_CALLS_TOTAL = Counter(
    "adaptiveui_blueprint_llm_calls_total",
    "LLM calls attempted.",
    labelnames=("outcome",),
    registry=REGISTRY,
)

FEEDBACK_TOTAL = Counter(
    "adaptiveui_blueprint_feedback_total",
    "Verifier feedback reports received from clients.",
    labelnames=("outcome",),
    registry=REGISTRY,
)

QUARANTINE_TOTAL = Counter(
    "adaptiveui_blueprint_quarantine_total",
    "Structural hashes promoted to quarantine.",
    registry=REGISTRY,
)

REQUEST_LATENCY_SECONDS = Histogram(
    "adaptiveui_blueprint_request_latency_seconds",
    "Latency of /blueprint requests.",
    registry=REGISTRY,
)

SYNC_UPLOADS_TOTAL = Counter(
    "adaptiveui_sync_uploads_total",
    "Encrypted UX DNA uploads received.",
    registry=REGISTRY,
)

SYNC_DOWNLOADS_TOTAL = Counter(
    "adaptiveui_sync_downloads_total",
    "Encrypted UX DNA downloads served.",
    labelnames=("outcome",),
    registry=REGISTRY,
)


def render() -> tuple[bytes, str]:
    return generate_latest(REGISTRY), CONTENT_TYPE_LATEST
