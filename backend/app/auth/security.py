import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings
from app.core.errors import AppError

password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def hash_token(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def random_token() -> str:
    return secrets.token_urlsafe(48)


def create_jwt(subject: uuid.UUID, kind: str, lifetime: timedelta) -> tuple[str, datetime, str]:
    settings = get_settings()
    now = datetime.now(UTC)
    expires = now + lifetime
    token_id = str(uuid.uuid4())
    encoded = jwt.encode(
        {
            "sub": str(subject),
            "type": kind,
            "iat": now,
            "nbf": now,
            "exp": expires,
            "jti": token_id,
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
        },
        settings.secret_key,
        algorithm="HS256",
    )
    return encoded, expires, token_id


def decode_jwt(token: str, expected_kind: str) -> dict:
    try:
        settings = get_settings()
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=["HS256"],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "type", "iat", "nbf", "exp", "jti", "iss", "aud"]},
        )
    except jwt.PyJWTError as exc:
        raise AppError("invalid_token", "Token is invalid or expired", 401) from exc
    if payload.get("type") != expected_kind:
        raise AppError("invalid_token", "Unexpected token type", 401)
    return payload
