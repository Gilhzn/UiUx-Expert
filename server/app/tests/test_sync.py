import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    # `with TestClient` triggers lifespan, which initialises the DB schema.
    with TestClient(app) as c:
        yield c


def payload(device_id: str = "dev_abc12345") -> dict:
    return {
        "deviceId": device_id,
        "salt_b64": "AAAAAAAAAAAAAAAAAAAAAA==",
        "iv_b64": "AAAAAAAAAAAAAAAA",
        "ciphertext_b64": "Y2lwaGVydGV4dA==",
        "version": 1,
    }


def test_upload_creates_record_and_download_returns_it(client):
    r = client.post("/sync/uxdna", json=payload())
    assert r.status_code == 200
    assert r.json()["ok"] is True

    r = client.get("/sync/uxdna/dev_abc12345")
    assert r.status_code == 200
    body = r.json()
    assert body["deviceId"] == "dev_abc12345"
    assert body["ciphertext_b64"] == "Y2lwaGVydGV4dA=="


def test_download_missing_returns_404(client):
    r = client.get("/sync/uxdna/dev_does_not_exist_12345")
    assert r.status_code == 404


def test_upload_updates_existing_record(client):
    p1 = payload("dev_update")
    client.post("/sync/uxdna", json=p1)
    p2 = {**p1, "ciphertext_b64": "bmV3Y2lwaGVy"}
    client.post("/sync/uxdna", json=p2)
    r = client.get("/sync/uxdna/dev_update")
    assert r.json()["ciphertext_b64"] == "bmV3Y2lwaGVy"


def test_upload_rejects_short_device_id(client):
    p = payload("short")
    r = client.post("/sync/uxdna", json=p)
    assert r.status_code == 422
