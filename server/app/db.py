"""SQLAlchemy async engine + session factory.

DATABASE_URL controls the backend:
  - "sqlite+aiosqlite:///:memory:"  (default; in-process, used by tests)
  - "sqlite+aiosqlite:////tmp/adaptiveui.db"
  - "postgresql+asyncpg://user:pass@host/dbname"

Tables are created on app startup via init_db().
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite+aiosqlite:///:memory:",
)

_engine = create_async_engine(DATABASE_URL, future=True)
_SessionLocal = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    async with _SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    from . import models  # noqa: F401 — ensures models are registered

    async with _engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)


async def shutdown_db() -> None:
    await _engine.dispose()
