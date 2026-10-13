"""Tenant role assignment cannot confer platform privileges."""

from app.identity.models import Role

PLATFORM_PERMISSIONS = frozenset({"catalog.manage"})


def is_tenant_assignable(role: Role, organization_id) -> bool:
    return role.organization_id == organization_id and not any(
        permission.code in PLATFORM_PERMISSIONS for permission in role.permissions
    )
