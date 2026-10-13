import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.schemas import TokenPair
from app.auth.security import (
    create_jwt,
    decode_jwt,
    hash_password,
    hash_token,
    random_token,
    verify_password,
)
from app.core.config import get_settings
from app.core.errors import AppError
from app.identity.models import Membership, OneTimeToken, Organization, RefreshSession, Role, User
from app.identity.roles import is_tenant_assignable


class AuthService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.settings = get_settings()

    async def authenticate(self, email: str, password: str) -> User:
        user = await self.session.scalar(select(User).where(User.email == email.lower()))
        if not user or not user.is_active or not verify_password(password, user.password_hash):
            raise AppError("invalid_credentials", "Email or password is incorrect", 401)
        return user

    async def issue_pair(
        self,
        user: User,
        family_id: uuid.UUID | None = None,
        replaces: RefreshSession | None = None,
    ) -> TokenPair:
        access, _, _ = create_jwt(
            user.id, "access", timedelta(minutes=self.settings.access_token_minutes)
        )
        refresh, expires, token_id = create_jwt(
            user.id, "refresh", timedelta(days=self.settings.refresh_token_days)
        )
        refresh_session = RefreshSession(
            user_id=user.id,
            token_hash=hash_token(token_id),
            family_id=family_id or uuid.uuid4(),
            replaced_by_id=None,
            expires_at=expires,
            revoked_at=None,
            created_at=datetime.now(UTC),
        )
        self.session.add(refresh_session)
        await self.session.flush()
        if replaces:
            replaces.replaced_by_id = refresh_session.id
        await self.session.commit()
        return TokenPair(
            access_token=access,
            refresh_token=refresh,
            expires_in=self.settings.access_token_minutes * 60,
        )

    async def rotate_refresh(self, token: str) -> tuple[User, TokenPair]:
        payload = decode_jwt(token, "refresh")
        now = datetime.now(UTC)
        stored = await self.session.scalar(
            select(RefreshSession)
            .where(RefreshSession.token_hash == hash_token(payload["jti"]))
            .with_for_update()
        )
        if not stored or stored.revoked_at or _is_expired(stored.expires_at, now):
            raise AppError("invalid_token", "Refresh session is invalid", 401)
        stored.revoked_at = now
        user = await self.session.get(User, stored.user_id)
        if not user or not user.is_active:
            raise AppError("invalid_token", "User is inactive or missing", 401)
        await self.session.flush()
        return user, await self.issue_pair(user, family_id=stored.family_id, replaces=stored)

    async def revoke_refresh(self, token: str) -> None:
        payload = decode_jwt(token, "refresh")
        stored = await self.session.scalar(
            select(RefreshSession).where(RefreshSession.token_hash == hash_token(payload["jti"]))
        )
        if stored and not stored.revoked_at:
            stored.revoked_at = datetime.now(UTC)
            await self.session.commit()

    async def create_one_time_token(
        self,
        purpose: str,
        email: str,
        organization_id: uuid.UUID | None = None,
        role_id: uuid.UUID | None = None,
        lifetime_hours: int = 24,
    ) -> tuple[str, int]:
        raw = random_token()
        seconds = lifetime_hours * 3600
        self.session.add(
            OneTimeToken(
                purpose=purpose,
                token_hash=hash_token(raw),
                email=email.lower(),
                organization_id=organization_id,
                role_id=role_id,
                expires_at=datetime.now(UTC) + timedelta(seconds=seconds),
                used_at=None,
            )
        )
        await self.session.commit()
        return raw, seconds

    async def consume_token(self, raw: str, purpose: str) -> OneTimeToken:
        now = datetime.now(UTC)
        token = await self.session.scalar(
            select(OneTimeToken)
            .where(
                OneTimeToken.token_hash == hash_token(raw),
                OneTimeToken.purpose == purpose,
            )
            .with_for_update()
        )
        if not token or token.used_at or _is_expired(token.expires_at, now):
            raise AppError("invalid_token", "Token is invalid or expired", 400)
        token.used_at = now
        return token

    async def accept_invitation(self, raw: str, display_name: str, password: str) -> User:
        token = await self.consume_token(raw, "invitation")
        if token.organization_id is None or token.role_id is None:
            raise AppError("invalid_token", "Invitation is incomplete", 400)
        organization = await self.session.get(Organization, token.organization_id)
        role = await self.session.get(Role, token.role_id)
        if (
            not organization
            or not organization.is_active
            or not role
            or not is_tenant_assignable(role, token.organization_id)
        ):
            raise AppError(
                "invalid_token", "Invitation role or organization is no longer available", 400
            )
        existing = await self.session.scalar(select(User).where(User.email == token.email))
        user = existing or User(
            email=token.email,
            display_name=display_name,
            password_hash=hash_password(password),
            is_active=True,
        )
        if not existing:
            self.session.add(user)
            await self.session.flush()
        membership = await self.session.scalar(
            select(Membership).where(
                Membership.user_id == user.id,
                Membership.organization_id == token.organization_id,
            )
        )
        if not membership:
            self.session.add(
                Membership(
                    user_id=user.id,
                    organization_id=token.organization_id,
                    role_id=token.role_id,
                    is_active=True,
                )
            )
        await self.session.commit()
        return user

    async def reset_password(self, raw: str, password: str) -> None:
        token = await self.consume_token(raw, "password_reset")
        user = await self.session.scalar(select(User).where(User.email == token.email))
        if not user:
            raise AppError("invalid_token", "Token is invalid", 400)
        user.password_hash = hash_password(password)
        await self.session.execute(
            RefreshSession.__table__.update()
            .where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        await self.session.commit()


def _is_expired(value: datetime, now: datetime) -> bool:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value <= now
