"""Persistent catalog fields and explicit global catalog permission.

Revision ID: e90a41c37b28
Revises: d6b2e8f09a12
"""

from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "e90a41c37b28"
down_revision: str | None = "d6b2e8f09a12"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
JSON_TYPE = sa.JSON().with_variant(JSONB(), "postgresql")
PERMISSION_ID = UUID("ac706370-2fd4-4f1a-b362-dcc6c082f290")
ROLE_ID = UUID("ac706370-2fd4-4f1a-b362-dcc6c082f291")


def upgrade() -> None:
    # Existing URLs retain their slug; imported records later get their exact original keys.
    for table, length in (("catalog_categories", 200), ("catalog_products", 240)):
        op.add_column(table, sa.Column("public_key", sa.String(length), nullable=True))
        op.execute(sa.text(f"UPDATE {table} SET public_key = slug"))
        with op.batch_alter_table(table) as batch:
            batch.alter_column("public_key", existing_type=sa.String(length), nullable=False)
            batch.create_index(f"ix_{table}_public_key", ["public_key"], unique=True)
    with op.batch_alter_table("catalog_products") as batch:
        batch.add_column(sa.Column("price", sa.Numeric(18, 2), nullable=True))
        batch.add_column(sa.Column("currency", sa.String(3), nullable=True))
        batch.add_column(
            sa.Column("price_mode", sa.String(20), nullable=False, server_default="on_request")
        )
        batch.add_column(sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
        batch.add_column(sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))
        for name in ("specs", "provenance", "source_data"):
            batch.add_column(sa.Column(name, JSON_TYPE, nullable=False, server_default="{}"))
        batch.add_column(sa.Column("media", JSON_TYPE, nullable=False, server_default="[]"))
        batch.create_check_constraint(
            "valid_catalog_status", "status IN ('draft','published','hidden')"
        )
        batch.create_check_constraint("positive_catalog_version", "version >= 1")
        batch.create_check_constraint(
            "valid_catalog_price",
            "(price_mode = 'on_request' AND price IS NULL) OR "
            "(price_mode = 'fixed' AND price IS NOT NULL AND price >= 0 AND currency IS NOT NULL)",
        )
        batch.create_check_constraint(
            "valid_catalog_currency",
            "currency IS NULL OR (length(currency) = 3 AND currency = upper(currency))",
        )
    # Defaults only backfill existing rows; application defaults own future inserts.
    with op.batch_alter_table("catalog_products") as batch:
        for name in (
            "price_mode",
            "version",
            "sort_order",
            "specs",
            "provenance",
            "source_data",
            "media",
        ):
            batch.alter_column(name, server_default=None)
    permissions = sa.table(
        "permissions",
        sa.column("id", sa.Uuid()),
        sa.column("code", sa.String()),
        sa.column("description", sa.String()),
    )
    roles = sa.table(
        "roles",
        sa.column("id", sa.Uuid()),
        sa.column("organization_id", sa.Uuid()),
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    role_permissions = sa.table(
        "role_permissions", sa.column("role_id", sa.Uuid()), sa.column("permission_id", sa.Uuid())
    )
    connection = op.get_bind()
    permission_id = connection.scalar(
        sa.select(permissions.c.id).where(permissions.c.code == "catalog.manage")
    )
    if permission_id is None:
        permission_id = PERMISSION_ID
        connection.execute(
            permissions.insert().values(
                id=permission_id,
                code="catalog.manage",
                description="Manage the platform-wide product catalog",
            )
        )
    role_id = connection.scalar(
        sa.select(roles.c.id).where(
            roles.c.organization_id.is_(None), roles.c.code == "platform_catalog_manager"
        )
    )
    if role_id is None:
        role_id = ROLE_ID
        connection.execute(
            roles.insert().values(
                id=role_id,
                organization_id=None,
                code="platform_catalog_manager",
                name="Platform catalog manager",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
    if (
        connection.scalar(
            sa.select(role_permissions.c.role_id).where(
                role_permissions.c.role_id == role_id,
                role_permissions.c.permission_id == permission_id,
            )
        )
        is None
    ):
        connection.execute(
            role_permissions.insert().values(role_id=role_id, permission_id=permission_id)
        )
    # Deliberately grant no memberships and no catalog permissions to tenant roles.


def downgrade() -> None:
    # Leave explicit platform grants intact: removing memberships would destroy access decisions.
    with op.batch_alter_table("catalog_products") as batch:
        for name in (
            "valid_catalog_status",
            "positive_catalog_version",
            "valid_catalog_price",
            "valid_catalog_currency",
        ):
            batch.drop_constraint(op.f(f"ck_catalog_products_{name}"), type_="check")
        for name in (
            "media",
            "source_data",
            "provenance",
            "specs",
            "version",
            "sort_order",
            "price_mode",
            "currency",
            "price",
        ):
            batch.drop_column(name)
    for table in ("catalog_products", "catalog_categories"):
        with op.batch_alter_table(table) as batch:
            batch.drop_index(f"ix_{table}_public_key")
            batch.drop_column("public_key")
