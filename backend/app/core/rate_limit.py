from collections import deque
from math import ceil
from threading import Lock
from time import monotonic

from fastapi import HTTPException, Request


class AuthRateLimiter:
    """Per-process sliding window; use shared storage for multiple workers."""

    def __init__(self, window=60, max_keys=10000):
        self.window = window
        self.max_keys = max_keys
        self.events = {}
        self.lock = Lock()

    def check(self, key, limit):
        now = monotonic()
        with self.lock:
            # Expire inactive keys so arbitrary usernames cannot grow memory forever.
            for old_key in list(self.events):
                entries = self.events[old_key]
                while entries and entries[0] <= now - self.window:
                    entries.popleft()
                if not entries:
                    del self.events[old_key]
            entries = self.events.get(key)
            if entries is None:
                if len(self.events) >= self.max_keys:
                    raise HTTPException(429, "Too many requests", headers={"Retry-After": str(self.window)})
                entries = self.events[key] = deque()
            if len(entries) >= limit:
                retry = max(1, ceil(entries[0] + self.window - now))
                raise HTTPException(429, "Too many requests", headers={"Retry-After": str(retry)})
            entries.append(now)


auth_limiter = AuthRateLimiter()


def check_auth_ip(request: Request):
    # Do not trust client-supplied forwarding headers.
    ip = request.client.host if request.client else "unknown"
    auth_limiter.check(("ip", ip), 30)


def check_login_attempt(login: str):
    auth_limiter.check(("login", login), 10)
