import uuid

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit.service import record_audit
from app.auth.dependencies import AuthContext, current_user, require_permission
from app.core.database import get_session
from app.core.errors import AppError
from app.core.pagination import Page, PageParams, paginate
from app.core.schemas import APIRequest
from app.identity.models import Membership, Organization, Role, User
from app.identity.roles import PLATFORM_PERMISSIONS, is_tenant_assignable

router = APIRouter(prefix="/organizations", tags=["Organizations", "Users"])


class MembershipOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    organization_name: str
    role_id: uuid.UUID
    role_name: str
    permissions: list[str]


def membership_out(item: Membership) -> MembershipOut:
    return MembershipOut(
        id=item.id,
        organization_id=item.organization_id,
        organization_name=item.organization.name,
        role_id=item.role_id,
        role_name=item.role.name,
        permissions=sorted(
            permission.code
            for permission in item.role.permissions
            if item.role.organization_id is None or permission.code not in PLATFORM_PERMISSIONS
        ),
    )


def membership_query():
    return select(Membership).options(
        selectinload(Membership.organization),
        selectinload(Membership.role).selectinload(Role.permissions),
    )


@router.get("", response_model=Page[MembershipOut])
async def my_organizations(
    page: PageParams = Depends(),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    items, total = await paginate(
        session,
        membership_query()
        .join(Organization)
        .where(
            Membership.user_id == user.id,
            Membership.is_active.is_(True),
            Organization.is_active.is_(True),
        )
        .order_by(Membership.created_at, Membership.id),
        page,
    )
    return Page(
        items=[membership_out(item) for item in items],
        page=page.page,
        page_size=page.page_size,
        total=total,
    )


class MemberOut(BaseModel):
    membership_id: uuid.UUID
    user_id: uuid.UUID
    email: str
    display_name: str
    role_id: uuid.UUID
    role_name: str


@router.get("/members", response_model=Page[MemberOut])
async def members(
    page: PageParams = Depends(),
    context: AuthContext = Depends(require_permission("organization.manage_users")),
    session: AsyncSession = Depends(get_session),
):
    items, total = await paginate(
        session,
        membership_query()
        .where(Membership.organization_id == context.organization_id)
        .options(selectinload(Membership.user))
        .order_by(Membership.created_at, Membership.id),
        page,
    )
    return Page(
        items=[
            MemberOut(
                membership_id=item.id,
                user_id=item.user_id,
                email=item.user.email,
                display_name=item.user.display_name,
                role_id=item.role_id,
                role_name=item.role.name,
            )
            for item in items
        ],
        page=page.page,
        page_size=page.page_size,
        total=total,
    )


class RoleChange(APIRequest):
    role_id: uuid.UUID


@router.patch("/members/{membership_id}/role", response_model=MemberOut)
async def change_role(
    membership_id: uuid.UUID,
    body: RoleChange,
    request: Request,
    context: AuthContext = Depends(require_permission("organization.manage_users")),
    session: AsyncSession = Depends(get_session),
):
    membership = await session.scalar(
        membership_query()
        .where(
            Membership.id == membership_id,
            Membership.organization_id == context.organization_id,
        )
        .options(selectinload(Membership.user))
    )
    role = await session.scalar(
        select(Role).where(Role.id == body.role_id, Role.organization_id == context.organization_id)
    )
    if not membership or not role:
        raise AppError("membership_or_role_not_found", "Membership or role not found", 404)
    if not is_tenant_assignable(role, context.organization_id):
        raise AppError(
            "permission_denied", "Platform roles cannot be assigned by tenant users", 403
        )
    if membership.role.organization_id is None:
        raise AppError("permission_denied", "Platform memberships cannot be edited here", 403)
    previous_role = membership.role_id
    membership.role_id = role.id
    await record_audit(
        session,
        request,
        "role.change",
        context.user.id,
        context.organization_id,
        "membership",
        str(membership.id),
        {"previous_role_id": str(previous_role), "new_role_id": str(role.id)},
    )
    await session.commit()
    return MemberOut(
        membership_id=membership.id,
        user_id=membership.user_id,
        email=membership.user.email,
        display_name=membership.user.display_name,
        role_id=role.id,
        role_name=role.name,
    )
