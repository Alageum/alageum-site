from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import record_audit
from app.auth.dependencies import AuthContext, auth_context, require_permission
from app.auth.schemas import (
    InvitationAcceptRequest,
    InviteRequest,
    LoginRequest,
    MeResponse,
    OrganizationInfo,
    RefreshRequest,
    ResetConfirmRequest,
    ResetRequest,
    TokenPair,
    TokenResponse,
    UserInfo,
)
from app.auth.service import AuthService
from app.core.config import get_settings
from app.core.database import get_session
from app.core.errors import AppError
from app.core.rate_limit import RateLimitPolicy, limit_login, rate_limit
from app.identity.models import Role, User
from app.identity.roles import is_tenant_assignable

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenPair, summary="Authenticate with email and password")
async def login(
    body: LoginRequest,
    request: Request,
    _: None = Depends(limit_login),
    session: AsyncSession = Depends(get_session),
):
    service = AuthService(session)
    user = await service.authenticate(body.email, body.password)
    await record_audit(session, request, "login", actor_user_id=user.id)
    await session.commit()
    return await service.issue_pair(user)


@router.post("/refresh", response_model=TokenPair, summary="Rotate a refresh token")
async def refresh(body: RefreshRequest, session: AsyncSession = Depends(get_session)):
    _, pair = await AuthService(session).rotate_refresh(body.refresh_token)
    return pair


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    body: RefreshRequest, request: Request, session: AsyncSession = Depends(get_session)
):
    service = AuthService(session)
    await service.revoke_refresh(body.refresh_token)
    await record_audit(session, request, "logout")
    await session.commit()


@router.get("/me", response_model=MeResponse)
async def me(context: AuthContext = Depends(auth_context)):
    return MeResponse(
        user=UserInfo.model_validate(context.user, from_attributes=True),
        organization=OrganizationInfo.model_validate(
            context.membership.organization, from_attributes=True
        ),
        permissions=sorted(context.permissions),
    )


@router.post("/invitations", response_model=TokenResponse, status_code=201)
async def invite(
    body: InviteRequest,
    request: Request,
    context: AuthContext = Depends(require_permission("organization.manage_users")),
    session: AsyncSession = Depends(get_session),
):
    role = await session.scalar(
        select(Role).where(Role.id == body.role_id, Role.organization_id == context.organization_id)
    )
    if not role:
        raise AppError("role_not_found", "Role does not belong to this organization", 404)
    if not is_tenant_assignable(role, context.organization_id):
        raise AppError("permission_denied", "Platform roles cannot be invited by tenant users", 403)
    token, expires = await AuthService(session).create_one_time_token(
        "invitation", body.email, context.organization_id, body.role_id
    )
    await record_audit(
        session,
        request,
        "user.invite",
        context.user.id,
        context.organization_id,
        "invitation",
        metadata={"email": str(body.email)},
    )
    await session.commit()
    exposed = token if get_settings().env in {"development", "test"} else ""
    return TokenResponse(token=exposed, expires_in=expires)


@router.post("/invitations/{token}/accept", response_model=TokenPair)
async def accept_invitation(
    token: str, body: InvitationAcceptRequest, session: AsyncSession = Depends(get_session)
):
    service = AuthService(session)
    user = await service.accept_invitation(token, body.display_name, body.password)
    return await service.issue_pair(user)


@router.post("/password/reset/request", response_model=TokenResponse)
async def request_reset(
    body: ResetRequest,
    _: None = Depends(rate_limit(RateLimitPolicy.PASSWORD_RESET)),
    session: AsyncSession = Depends(get_session),
):
    user = await session.scalar(select(User).where(User.email == str(body.email).lower()))
    if user:
        token, expires = await AuthService(session).create_one_time_token(
            "password_reset", user.email, lifetime_hours=1
        )
        exposed = token if get_settings().env in {"development", "test"} else ""
        return TokenResponse(token=exposed, expires_in=expires)
    # Identical public behavior prevents account enumeration.
    # The DEV-only response carries an empty token when the account is missing.
    return TokenResponse(token="", expires_in=3600)


@router.post("/password/reset/confirm", status_code=204)
async def confirm_reset(body: ResetConfirmRequest, session: AsyncSession = Depends(get_session)):
    await AuthService(session).reset_password(body.token, body.password)
