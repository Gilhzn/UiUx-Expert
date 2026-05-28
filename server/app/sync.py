"""End-to-end encrypted UX DNA sync endpoints.

The server stores an opaque ciphertext blob keyed by deviceId. Encryption
and decryption happen entirely on the client using a passphrase the
server never sees (PBKDF2 → AES-GCM, see src/core/sync/crypto.ts).

POST /sync/uxdna       upload latest ciphertext for a device
GET  /sync/uxdna/{id}  fetch latest ciphertext for a device

Anyone with the deviceId can pull the ciphertext; only the passphrase
holder can decrypt. Pair the deviceId with a strong passphrase to keep
the data confidential.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from . import metrics
from .db import session_scope
from .models import SyncRecord

router = APIRouter()


class SyncPayload(BaseModel):
    deviceId: str = Field(min_length=8, max_length=128)
    salt_b64: str = Field(min_length=1)
    iv_b64: str = Field(min_length=1)
    ciphertext_b64: str = Field(min_length=1, max_length=200_000)
    version: int = 1


class SyncResponse(BaseModel):
    deviceId: str
    salt_b64: str
    iv_b64: str
    ciphertext_b64: str
    version: int
    updated_at: str


@router.post("/sync/uxdna")
async def upload(payload: SyncPayload) -> dict[str, object]:
    async with session_scope() as session:
        existing = (
            await session.execute(
                select(SyncRecord).where(SyncRecord.device_id == payload.deviceId)
            )
        ).scalar_one_or_none()
        if existing is None:
            session.add(
                SyncRecord(
                    device_id=payload.deviceId,
                    version=payload.version,
                    salt_b64=payload.salt_b64,
                    iv_b64=payload.iv_b64,
                    ciphertext_b64=payload.ciphertext_b64,
                )
            )
        else:
            existing.version = payload.version
            existing.salt_b64 = payload.salt_b64
            existing.iv_b64 = payload.iv_b64
            existing.ciphertext_b64 = payload.ciphertext_b64
    metrics.SYNC_UPLOADS_TOTAL.inc()
    return {"ok": True}


@router.get("/sync/uxdna/{device_id}", response_model=SyncResponse)
async def download(device_id: str) -> SyncResponse:
    async with session_scope() as session:
        row = (
            await session.execute(
                select(SyncRecord).where(SyncRecord.device_id == device_id)
            )
        ).scalar_one_or_none()
    if row is None:
        metrics.SYNC_DOWNLOADS_TOTAL.labels(outcome="miss").inc()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    metrics.SYNC_DOWNLOADS_TOTAL.labels(outcome="hit").inc()
    return SyncResponse(
        deviceId=row.device_id,
        salt_b64=row.salt_b64,
        iv_b64=row.iv_b64,
        ciphertext_b64=row.ciphertext_b64,
        version=row.version,
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )
