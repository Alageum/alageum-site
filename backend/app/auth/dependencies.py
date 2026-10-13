import uuid
from dataclasses import dataclass

import structlog
from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.security import decode_jwt
from app.core.database import get_session
from app.core.errors import AppError
from app.identity.models import Membership, Role, User
from app.identity.roles import PLATFORM_PERMISSIONS

bearer = HTTPBearer(auto_error=False)


@dataclass
class AuthContext:
    user: User
    membership: Membership

    @property
    def organization_id(self) -> uuid.UUID:
        return self.membership.organization_id

    @property
    def permissions(self) -> set[str]:
        permissions = {item.code for item in self.membership.role.permissions}
        if self.membership.role.organization_id is not None:
            permissions -= PLATFORM_PERMISSIONS
        return permissions


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    if credentials is None:
        raise AppError("authentication_required", "Authentication required", 401)
    payload = decode_jwt(credentials.credentials, "access")
    user = await session.get(User, uuid.UUID(payload["sub"]))
    if not user or not user.is_active:
        raise AppError("authentication_required", "User is inactive or missing", 401)
    return user


current_user.authentication_required = True  # type: ignore[attr-defined]


async def auth_context(
    user: User = Depends(current_user),
    organization_id: uuid.UUID | None = Header(default=None, alias="X-Organization-ID"),
    session: AsyncSession = Depends(get_session),
) -> AuthContext:
    query = (
        select(Membership)
        .where(Membership.user_id == user.id, Membership.is_active.is_(True))
        .options(
            selectinload(Membership.organization),
            selectinload(Membership.role).selectinload(Role.permissions),
        )
    )
    if organization_id:
        query = query.where(Membership.organization_id == organization_id)
    memberships = list((await session.scalars(query)).all())
    if not memberships:
        raise AppError("organization_access_denied", "No active organization membership", 403)
    if len(memberships) > 1 and organization_id is None:
        raise AppError("organization_required", "X-Organization-ID header is required", 400)
    membership = memberships[0]
    if not membership.organization.is_active:
        raise AppError("organization_access_denied", "Organization is inactive", 403)
    if membership.role.organization_id not in {None, membership.organization_id}:
        raise AppError("organization_access_denied", "Role does not belong to organization", 403)
    context = AuthContext(user=user, membership=membership)
    structlog.contextvars.bind_contextvars(
        user_id=str(context.user.id), organization_id=str(context.organization_id)
    )
    return context


auth_context.authentication_required = True  # type: ignore[attr-defined]
auth_context.tenant_required = True  # type: ignore[attr-defined]


def require_permission(permission: str):
    async def dependency(context: AuthContext = Depends(auth_context)) -> AuthContext:
        if permission not in context.permissions:
            raise AppError("permission_denied", f"Permission '{permission}' is required", 403)
        return context

    dependency.authentication_required = True  # type: ignore[attr-defined]
    dependency.tenant_required = True  # type: ignore[attr-defined]
    dependency.required_permission = permission  # type: ignore[attr-defined]
    return dependency
