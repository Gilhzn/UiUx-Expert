import os

os.environ.setdefault("OLLAMA_DISABLED", "1")
os.environ.setdefault("REDIS_URL", "")

import pytest
from fastapi.testclient import TestClient

from app.cache import cache
from app.main import app
from app.quarantine import store as quarantine_store


@pytest.fixture(autouse=True)
async def clear_state():
    await cache.clear()
    await quarantine_store.clear()
    yield
    await cache.clear()
    await quarantine_store.clear()


client = TestClient(app)


def aside_payload(structural_hash: str) -> dict:
    return {
        "structuralHash": structural_hash,
        "skeleton": {"t": "body", "ch": [{"t": "aside", "i": 1}]},
    }


def test_single_feedback_does_not_quarantine():
    r = client.post(
        "/blueprint/feedback",
        json={"structuralHash": "abc", "verifierFailed": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["failures"] == 1
    assert body["quarantined"] is False


def test_two_failures_quarantine_the_hash():
    client.post("/blueprint/feedback", json={"structuralHash": "doomed", "verifierFailed": True})
    r = client.post(
        "/blueprint/feedback",
        json={"structuralHash": "doomed", "verifierFailed": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["failures"] >= 2
    assert body["quarantined"] is True


def test_quarantined_hash_returns_410():
    client.post("/blueprint/feedback", json={"structuralHash": "bad", "verifierFailed": True})
    client.post("/blueprint/feedback", json={"structuralHash": "bad", "verifierFailed": True})
    r = client.post("/blueprint", json=aside_payload("bad"))
    assert r.status_code == 410


def test_clean_hash_still_works_after_quarantine_of_another():
    client.post("/blueprint/feedback", json={"structuralHash": "bad", "verifierFailed": True})
    client.post("/blueprint/feedback", json={"structuralHash": "bad", "verifierFailed": True})
    r = client.post("/blueprint", json=aside_payload("fine"))
    assert r.status_code == 200
    assert r.json()["source"] == "heuristic"


def test_ok_feedback_does_not_count_against_hash():
    client.post("/blueprint/feedback", json={"structuralHash": "x", "verifierFailed": False})
    r = client.post("/blueprint", json=aside_payload("x"))
    assert r.status_code == 200
