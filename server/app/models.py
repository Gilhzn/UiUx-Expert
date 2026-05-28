"""ORM models for blueprint history, feedback, and encrypted sync records."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


class BlueprintHistory(Base):
    __tablename__ = "blueprint_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    structural_hash: Mapped[str] = mapped_column(String(64), index=True)
    source: Mapped[str] = mapped_column(String(16))  # llm | heuristic
    blueprint_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_now
    )


class FeedbackHistory(Base):
    __tablename__ = "feedback_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    structural_hash: Mapped[str] = mapped_column(String(64), index=True)
    verifier_failed: Mapped[bool] = mapped_column(Boolean, default=True)
    issues: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_now
    )


class SyncRecord(Base):
    """Opaque ciphertext blob keyed by device_id. The server only stores
    AES-GCM(salt, iv, ciphertext) — it cannot decrypt without the
    client-held passphrase."""

    __tablename__ = "sync_records"

    device_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    salt_b64: Mapped[str] = mapped_column(String(128))
    iv_b64: Mapped[str] = mapped_column(String(64))
    ciphertext_b64: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), default=_now
    )
