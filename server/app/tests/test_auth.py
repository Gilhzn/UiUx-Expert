import importlib
import os


def fresh_client(api_key: str = "", rate_limit_rps: str = "", rate_limit_burst: str = "5"):
    """Reload app modules so the env-driven settings get re-read."""
    os.environ["OLLAMA_DISABLED"] = "1"
    os.environ["REDIS_URL"] = ""
    os.environ["API_KEY"] = api_key
    os.environ["RATE_LIMIT_RPS"] = rate_limit_rps
    os.environ["RATE_LIMIT_BURST"] = rate_limit_burst

    import app.auth
    import app.main
    importlib.reload(app.auth)
    importlib.reload(app.main)

    from fastapi.testclient import TestClient
    return TestClient(app.main.app)


def test_health_works_without_api_key_even_when_required():
    client = fresh_client(api_key="secret-key")
    assert client.get("/health").status_code == 200


def test_blueprint_rejects_missing_api_key_when_required():
    client = fresh_client(api_key="secret-key")
    r = client.post("/blueprint", json={
        "structuralHash": "h",
        "skeleton": {"t": "body"},
    })
    assert r.status_code == 401


def test_blueprint_accepts_correct_api_key():
    client = fresh_client(api_key="secret-key")
    r = client.post(
        "/blueprint",
        json={"structuralHash": "h", "skeleton": {"t": "body"}},
        headers={"X-API-Key": "secret-key"},
    )
    assert r.status_code == 200


def test_blueprint_rejects_wrong_api_key():
    client = fresh_client(api_key="secret-key")
    r = client.post(
        "/blueprint",
        json={"structuralHash": "h", "skeleton": {"t": "body"}},
        headers={"X-API-Key": "wrong"},
    )
    assert r.status_code == 401


def test_rate_limit_triggers_after_burst():
    client = fresh_client(rate_limit_rps="0.0001", rate_limit_burst="3")
    payload = {"structuralHash": "h", "skeleton": {"t": "body"}}
    statuses = [client.post("/blueprint", json=payload).status_code for _ in range(6)]
    assert any(s == 429 for s in statuses), statuses


def test_disabled_auth_no_op():
    client = fresh_client(api_key="", rate_limit_rps="")
    r = client.post("/blueprint", json={"structuralHash": "h", "skeleton": {"t": "body"}})
    assert r.status_code == 200
