"""harden auth and audit sessions

Revision ID: 7a30267e01ab
Revises: a5f14d32c836
Create Date: 2026-08-27 12:26:02.321446
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "7a30267e01ab"
down_revision: str | None = "a5f14d32c836"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("audit_events") as batch:
        batch.add_column(
            sa.Column("source", sa.String(length=40), nullable=False, server_default="api")
        )
    with op.batch_alter_table("refresh_sessions") as batch:
        batch.add_column(sa.Column("family_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("replaced_by_id", sa.Uuid(), nullable=True))
    op.execute(sa.text("UPDATE refresh_sessions SET family_id = id WHERE family_id IS NULL"))
    with op.batch_alter_table("refresh_sessions") as batch:
        batch.alter_column("family_id", nullable=False)
        batch.create_index(op.f("ix_refresh_sessions_family_id"), ["family_id"], unique=False)
        batch.create_foreign_key(
            op.f("fk_refresh_sessions_replaced_by_id_refresh_sessions"),
            "refresh_sessions",
            ["replaced_by_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("refresh_sessions") as batch:
        batch.drop_constraint(
            op.f("fk_refresh_sessions_replaced_by_id_refresh_sessions"), type_="foreignkey"
        )
        batch.drop_index(op.f("ix_refresh_sessions_family_id"))
        batch.drop_column("replaced_by_id")
        batch.drop_column("family_id")
    with op.batch_alter_table("audit_events") as batch:
        batch.drop_column("source")
