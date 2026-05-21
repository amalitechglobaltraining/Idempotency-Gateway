import asyncio
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

KEY_TTL_HOURS = 24

STATUS_PROCESSING = "PROCESSING"
STATUS_COMPLETED = "COMPLETED"


@dataclass
class StorageRecord:
    idempotency_key: str
    body_hash: str
    status: str
    response: Optional[dict]
    created_at: datetime
    expires_at: datetime


class IdempotencyStore:
    def __init__(self) -> None:
        self._records: dict[str, StorageRecord] = {}
        self._events: dict[str, asyncio.Event] = {}

    def hash_body(self, body: dict) -> str:
        serialised = json.dumps(body, sort_keys=True)
        return hashlib.sha256(serialised.encode()).hexdigest()

    def get(self, key: str) -> Optional[StorageRecord]:
        record = self._records.get(key)
        if record is None:
            return None
        if self._is_expired(record):
            del self._records[key]
            self._events.pop(key, None)
            return None
        return record

    def _is_expired(self, record: StorageRecord) -> bool:
        return datetime.now(timezone.utc) > record.expires_at

    def mark_processing(self, key: str, body_hash: str) -> asyncio.Event:
        now = datetime.now(timezone.utc)
        self._records[key] = StorageRecord(
            idempotency_key=key,
            body_hash=body_hash,
            status=STATUS_PROCESSING,
            response=None,
            created_at=now,
            expires_at=now + timedelta(hours=KEY_TTL_HOURS),
        )
        event = asyncio.Event()
        self._events[key] = event
        return event

    def mark_completed(self, key: str, response: dict) -> None:
        record = self._records.get(key)
        if record:
            record.status = STATUS_COMPLETED
            record.response = response
        event = self._events.pop(key, None)
        if event:
            event.set()

    def get_event(self, key: str) -> Optional[asyncio.Event]:
        return self._events.get(key)

    def cleanup_expired(self) -> int:
        expired_keys = [
            key for key, record in self._records.items()
            if self._is_expired(record)
        ]
        for key in expired_keys:
            del self._records[key]
            self._events.pop(key, None)
        return len(expired_keys)


store = IdempotencyStore()
