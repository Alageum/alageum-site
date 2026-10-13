import asyncio
import ipaddress
import time
from abc import ABC, abstractmethod
from collections import OrderedDict, deque
from dataclasses import dataclass
from enum import StrEnum

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import AppError


class RateLimitPolicy(StrEnum):
    LOGIN = "login"
    PASSWORD_RESET = "password_reset"
    AI_CHAT = "ai_chat"
    FILE_UPLOAD = "file_upload"
    PUBLIC_FORM = "public_form"
    QUOTE_CREATE = "quote_create"


@dataclass(frozen=True)
class RateLimit:
    requests: int
    window_seconds: int


class RateLimiter(ABC):
    @abstractmethod
    async def check(self, policy: RateLimitPolicy, key: str) -> None: ...


class MemoryRateLimiter(RateLimiter):
    """Bounded single-process limiter for DEV/test deployments."""

    def __init__(self, policies: dict[RateLimitPolicy, RateLimit], max_keys: int):
        self.policies = policies
        self.max_keys = max_keys
        self.buckets: OrderedDict[tuple[RateLimitPolicy, str], deque[float]] = OrderedDict()
        self.lock = asyncio.Lock()

    async def check(self, policy: RateLimitPolicy, key: str) -> None:
        now = time.monotonic()
        limit = self.policies[policy]
        bucket_key = (policy, key)
        async with self.lock:
            bucket = self.buckets.setdefault(bucket_key, deque())
            self.buckets.move_to_end(bucket_key)
            while bucket and bucket[0] <= now - limit.window_seconds:
                bucket.popleft()
            if len(bucket) >= limit.requests:
                raise AppError("rate_limit_exceeded", "Too many requests", 429)
            bucket.append(now)
            while len(self.buckets) > self.max_keys:
                self.buckets.popitem(last=False)

    def clear(self) -> None:
        self.buckets.clear()


class RedisRateLimiter(RateLimiter):
    """Production adapter boundary; requires an atomic Redis implementation."""

    async def check(self, policy: RateLimitPolicy, key: str) -> None:
        raise RuntimeError("Redis rate limiter is not configured")


settings = get_settings()
DEFAULT_POLICIES = {
    RateLimitPolicy.LOGIN: RateLimit(settings.rate_limit_requests["login"], 60),
    RateLimitPolicy.PASSWORD_RESET: RateLimit(
        settings.rate_limit_requests["password_reset"], 300
    ),
    RateLimitPolicy.AI_CHAT: RateLimit(settings.rate_limit_requests["ai_chat"], 60),
    RateLimitPolicy.FILE_UPLOAD: RateLimit(settings.rate_limit_requests["file_upload"], 60),
    RateLimitPolicy.PUBLIC_FORM: RateLimit(settings.rate_limit_requests["public_form"], 60),
    RateLimitPolicy.QUOTE_CREATE: RateLimit(settings.rate_limit_requests["quote_create"], 60),
}
memory_rate_limiter = MemoryRateLimiter(DEFAULT_POLICIES, settings.rate_limit_max_keys)


def get_rate_limiter() -> RateLimiter:
    if settings.rate_limit_backend == "memory":
        return memory_rate_limiter
    if settings.rate_limit_backend == "redis":
        return RedisRateLimiter()
    raise RuntimeError("Unsupported rate limiter backend")


def client_key(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    if peer not in settings.trusted_proxy_ips:
        return peer
    forwarded = request.headers.get("X-Forwarded-For", "")
    try:
        hops = [str(ipaddress.ip_address(value.strip())) for value in forwarded.split(",") if value]
    except ValueError:
        return peer
    current = peer
    trusted = set(settings.trusted_proxy_ips)
    for hop in reversed(hops):
        if current not in trusted:
            break
        current = hop
    return current


def rate_limit(policy: RateLimitPolicy):
    async def dependency(request: Request) -> None:
        await get_rate_limiter().check(policy, client_key(request))

    dependency.rate_limit_policy = policy  # type: ignore[attr-defined]
    return dependency


limit_login = rate_limit(RateLimitPolicy.LOGIN)
