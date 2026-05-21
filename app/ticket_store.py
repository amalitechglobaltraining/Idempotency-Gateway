import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

TICKET_STATUS_PENDING = "PENDING"
TICKET_STATUS_USED = "USED"
TICKET_TTL_MINUTES = 30


@dataclass
class Ticket:
    ticket_id: str
    client_ip: str
    status: str
    created_at: datetime
    expires_at: datetime


class TicketStore:
    def __init__(self) -> None:
        self._tickets: dict[str, Ticket] = {}
        self._pending_per_ip: dict[str, str] = {}

    def generate(self, client_ip: str) -> str:
        previous_id = self._pending_per_ip.get(client_ip)
        if previous_id and previous_id in self._tickets:
            if self._tickets[previous_id].status == TICKET_STATUS_PENDING:
                del self._tickets[previous_id]

        token = secrets.token_hex(3)
        ticket_id = f"order-{token}"
        now = datetime.now(timezone.utc)

        self._tickets[ticket_id] = Ticket(
            ticket_id=ticket_id,
            client_ip=client_ip,
            status=TICKET_STATUS_PENDING,
            created_at=now,
            expires_at=now + timedelta(minutes=TICKET_TTL_MINUTES),
        )
        self._pending_per_ip[client_ip] = ticket_id
        return ticket_id

    def validate(self, ticket_id: str) -> tuple[bool, str]:
        ticket = self._tickets.get(ticket_id)
        if ticket is None:
            return False, "Ticket not recognised. Generate a ticket first using POST /generate-ticket."

        if datetime.now(timezone.utc) > ticket.expires_at:
            del self._tickets[ticket_id]
            self._pending_per_ip.pop(ticket.client_ip, None)
            return False, "Ticket has expired. Generate a new ticket using POST /generate-ticket."

        return True, ""

    def mark_used(self, ticket_id: str) -> None:
        ticket = self._tickets.get(ticket_id)
        if ticket and ticket.status == TICKET_STATUS_PENDING:
            ticket.status = TICKET_STATUS_USED
            self._pending_per_ip.pop(ticket.client_ip, None)

    def cleanup_expired(self) -> int:
        now = datetime.now(timezone.utc)
        expired = [tid for tid, t in self._tickets.items() if now > t.expires_at]
        for tid in expired:
            ticket = self._tickets.pop(tid)
            self._pending_per_ip.pop(ticket.client_ip, None)
        return len(expired)


ticket_store = TicketStore()
