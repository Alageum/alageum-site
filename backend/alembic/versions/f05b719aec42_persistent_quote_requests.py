"""Add idempotent catalogue RFQs with immutable product snapshots.

Revision ID: f05b719aec42
Revises: e90a41c37b28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "f05b719aec42"
down_revision: str | None = "e90a41c37b28"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("quote_requests") as batch:
        batch.add_column(sa.Column("idempotency_key", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("request_hash", sa.String(64), nullable=True))
        batch.create_unique_constraint(
            "uq_quote_request_submission", ["organization_id", "created_by_id", "idempotency_key"]
        )
    with op.batch_alter_table("quote_request_items") as batch:
        batch.add_column(sa.Column("position", sa.Integer(), nullable=False, server_default="0"))
        # Historic requests have no trustworthy historical catalogue snapshot. Never fabricate one.
        batch.add_column(
            sa.Column(
                "product_snapshot",
                sa.JSON().with_variant(JSONB(), "postgresql"),
                nullable=False,
                server_default="{}",
            )
        )
    with op.batch_alter_table("quote_request_items") as batch:
        batch.alter_column("position", server_default=None)
        batch.alter_column("product_snapshot", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("quote_request_items") as batch:
        batch.drop_column("product_snapshot")
        batch.drop_column("position")
    with op.batch_alter_table("quote_requests") as batch:
        batch.drop_constraint("uq_quote_request_submission", type_="unique")
        batch.drop_column("request_hash")
        batch.drop_column("idempotency_key")
