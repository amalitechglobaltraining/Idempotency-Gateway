from typing import Optional

from pydantic import BaseModel, field_validator

SUPPORTED_CURRENCIES = {"GHS", "USD", "EUR", "GBP", "NGN"}


class PaymentRequest(BaseModel):
    amount: float
    currency: str

    @field_validator("amount")
    @classmethod
    def amount_must_be_positive(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Amount must be greater than zero")
        return value

    @field_validator("currency")
    @classmethod
    def currency_must_be_supported(cls, value: str) -> str:
        normalised = value.upper()
        if normalised not in SUPPORTED_CURRENCIES:
            supported_list = ", ".join(sorted(SUPPORTED_CURRENCIES))
            raise ValueError(
                f"Currency {value} is not supported. Supported currencies: {supported_list}"
            )
        return normalised


class PaymentResponse(BaseModel):
    message: str
    status: str
    idempotency_key: str
    transaction_id: str
    processed_at: str


class ErrorResponse(BaseModel):
    error: str
    hint: Optional[str] = None
