import os

os.environ.setdefault("OLLAMA_DISABLED", "1")
os.environ.setdefault("REDIS_URL", "")

import pytest
from fastapi.testclient import TestClient

from app.cache import cache
from app.main import app


@pytest.fixture(autouse=True)
async def clear_cache():
    await cache.clear()
    yield
    await cache.clear()


client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True


def test_blueprint_uses_heuristic_without_llm():
    payload = {
        "structuralHash": "abc123",
        "skeleton": {
            "t": "body",
            "ch": [
                {"t": "main", "i": 1, "r": "main"},
                {"t": "aside", "i": 2, "c": "hash"},
            ],
        },
    }
    r = client.post("/blueprint", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "heuristic"
    bp = body["blueprint"]
    assert bp["version"] == 1
    assert bp["structuralHash"] == "abc123"
    assert len(bp["transforms"]) == 1
    t = bp["transforms"][0]
    assert t["action"] == "hide"
    assert t["anchor"]["tag"] == "aside"
    assert t["anchor"]["structuralPath"] == "body>aside:nth-child(2)"


def test_blueprint_cache_hit_on_repeat():
    payload = {
        "structuralHash": "stable-hash",
        "skeleton": {
            "t": "body",
            "ch": [{"t": "aside", "i": 1}],
        },
    }
    r1 = client.post("/blueprint", json=payload)
    assert r1.status_code == 200
    assert r1.json()["source"] == "heuristic"
    r2 = client.post("/blueprint", json=payload)
    assert r2.status_code == 200
    assert r2.json()["source"] == "cache"
    assert r2.json()["blueprint"]["structuralHash"] == "stable-hash"


def test_blueprint_rejects_malformed_payload():
    r = client.post("/blueprint", json={"skeleton": {"t": "body"}})
    assert r.status_code == 422


def test_blueprint_returns_empty_transforms_when_no_decorations_found():
    payload = {
        "structuralHash": "h",
        "skeleton": {
            "t": "body",
            "ch": [{"t": "main", "i": 1}, {"t": "article", "i": 2}],
        },
    }
    r = client.post("/blueprint", json=payload)
    assert r.status_code == 200
    bp = r.json()["blueprint"]
    assert bp["transforms"] == []
