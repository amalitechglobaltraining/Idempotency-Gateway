import asyncio
import hashlib
import json
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="Idempotency Gateway")


# models
class PaymentRequest(BaseModel):
    amount: float
    currency: str


class StoredResponse(BaseModel):
    status_code: int
    body: dict
    request_hash: str  


# in-memory store
idempotency_store: dict[str, StoredResponse] = {}


def hash_body(body: dict) -> str:
    """Return a stable SHA-256 fingerprint of a dict (order-independent)."""
    serialized = json.dumps(body, sort_keys=True)
    return hashlib.sha256(serialized.encode()).hexdigest()


@app.get("/")
def read_root():
    return {"message": "Idempotency Gateway is running"}


@app.post("/process-payment", status_code=201)
async def process_payment(
    payment: PaymentRequest,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
): 
    incoming_hash = hash_body(payment.model_dump())

    # idempotency key-check 


    # Simulate payment processing (2-second delay)
    await asyncio.sleep(2)
    result = {
        "status": "success",
        "message": f"Charged {payment.amount} {payment.currency}",
    }

    idempotency_store[idempotency_key] = StoredResponse(
        status_code=201,
        body=result,
        request_hash=incoming_hash,
    )

    return result 
