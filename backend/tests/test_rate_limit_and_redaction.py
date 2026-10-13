import pytest
from starlette.requests import Request

from app.core.errors import AppError
from app.core.rate_limit import MemoryRateLimiter, RateLimit, RateLimitPolicy, client_key, settings
from app.core.redaction import REDACTED, redact_sensitive


async def test_memory_rate_limiter_enforces_policy_and_bounds_keys():
    limiter = MemoryRateLimiter({RateLimitPolicy.LOGIN: RateLimit(2, 60)}, max_keys=2)
    await limiter.check(RateLimitPolicy.LOGIN, "a")
    await limiter.check(RateLimitPolicy.LOGIN, "a")
    with pytest.raises(AppError) as error:
        await limiter.check(RateLimitPolicy.LOGIN, "a")
    assert error.value.status_code == 429
    await limiter.check(RateLimitPolicy.LOGIN, "b")
    await limiter.check(RateLimitPolicy.LOGIN, "c")
    assert len(limiter.buckets) == 2


def test_sensitive_data_redaction_is_recursive():
    value = redact_sensitive(
        {
            "password": "secret",
            "nested": {"refresh_token": "token", "safe": "visible"},
            "items": [{"api_key": "key"}],
        }
    )
    assert value == {
        "password": REDACTED,
        "nested": {"refresh_token": REDACTED, "safe": "visible"},
        "items": [{"api_key": REDACTED}],
    }


def test_forwarded_for_is_used_only_through_trusted_proxy():
    original = settings.trusted_proxy_ips
    try:
        settings.trusted_proxy_ips = []
        untrusted = Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/",
                "headers": [(b"x-forwarded-for", b"203.0.113.9")],
                "client": ("198.51.100.10", 1234),
            }
        )
        assert client_key(untrusted) == "198.51.100.10"
        settings.trusted_proxy_ips = ["127.0.0.1"]
        trusted = Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/",
                "headers": [(b"x-forwarded-for", b"198.51.100.22")],
                "client": ("127.0.0.1", 1234),
            }
        )
        assert client_key(trusted) == "198.51.100.22"
    finally:
        settings.trusted_proxy_ips = original
