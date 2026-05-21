from collections import deque
from datetime import datetime, timedelta, timezone

RATE_LIMIT_MAX_REQUESTS = 10
RATE_LIMIT_WINDOW_SECONDS = 60


class RateLimiter:
    def __init__(self) -> None:
        self._windows: dict[str, deque[datetime]] = {}

    def is_allowed(self, client_ip: str) -> bool:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=RATE_LIMIT_WINDOW_SECONDS)

        if client_ip not in self._windows:
            self._windows[client_ip] = deque()

        window = self._windows[client_ip]

        while window and window[0] < cutoff:
            window.popleft()

        if len(window) >= RATE_LIMIT_MAX_REQUESTS:
            return False

        window.append(now)
        return True

    def cleanup_stale_ips(self) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=RATE_LIMIT_WINDOW_SECONDS)
        stale = [ip for ip, window in self._windows.items() if not window or window[-1] < cutoff]
        for ip in stale:
            del self._windows[ip]
        return len(stale)


rate_limiter = RateLimiter()
