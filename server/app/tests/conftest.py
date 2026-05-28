"""Pytest setup shared by every test in app/tests/."""

import os
import tempfile

# Set env vars BEFORE any app import so module-level config picks them up.
os.environ.setdefault("OLLAMA_DISABLED", "1")
os.environ.setdefault("REDIS_URL", "")

# aiosqlite ":memory:" is per-connection — use a temp file so the schema
# created by lifespan startup is visible to subsequent request handlers
# (TestClient opens fresh connections per request).
_DB_PATH = os.path.join(tempfile.gettempdir(), "adaptiveui-pytest.db")
if os.path.exists(_DB_PATH):
    os.unlink(_DB_PATH)
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{_DB_PATH}")


def pytest_sessionfinish(session, exitstatus):  # type: ignore[no-untyped-def]
    if os.path.exists(_DB_PATH):
        try:
            os.unlink(_DB_PATH)
        except OSError:
            pass
