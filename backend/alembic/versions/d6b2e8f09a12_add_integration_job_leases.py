"""add integration job leases

Revision ID: d6b2e8f09a12
Revises: c24e3a19f4b1
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d6b2e8f09a12"
down_revision: str | None = "c24e3a19f4b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("ix_integration_jobs_due", table_name="integration_jobs")
    op.add_column("integration_jobs", sa.Column("started_at", sa.DateTime(timezone=True)))
    op.add_column("integration_jobs", sa.Column("heartbeat_at", sa.DateTime(timezone=True)))
    op.add_column("integration_jobs", sa.Column("locked_by", sa.String(length=120)))
    op.add_column("integration_jobs", sa.Column("lock_expires_at", sa.DateTime(timezone=True)))
    op.add_column("integration_jobs", sa.Column("finished_at", sa.DateTime(timezone=True)))
    op.create_index(
        "ix_integration_jobs_lock_expires_at",
        "integration_jobs",
        ["lock_expires_at"],
    )
    op.create_index(
        "ix_integration_jobs_due",
        "integration_jobs",
        ["status", "next_attempt_at", "lock_expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_integration_jobs_due", table_name="integration_jobs")
    op.drop_index("ix_integration_jobs_lock_expires_at", table_name="integration_jobs")
    op.drop_column("integration_jobs", "finished_at")
    op.drop_column("integration_jobs", "lock_expires_at")
    op.drop_column("integration_jobs", "locked_by")
    op.drop_column("integration_jobs", "heartbeat_at")
    op.drop_column("integration_jobs", "started_at")
    op.create_index(
        "ix_integration_jobs_due",
        "integration_jobs",
        ["status", "next_attempt_at"],
    )
