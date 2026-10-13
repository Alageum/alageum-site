"""scope document versions to tenant

Revision ID: c24e3a19f4b1
Revises: 8f92af1ed797
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c24e3a19f4b1"
down_revision: str | None = "8f92af1ed797"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("document_versions") as batch:
        batch.add_column(sa.Column("organization_id", sa.Uuid(), nullable=True))
        batch.drop_constraint(
            "fk_document_versions_document_id_documents", type_="foreignkey"
        )
        batch.drop_constraint("fk_document_versions_file_id_file_objects", type_="foreignkey")

    op.execute(
        "UPDATE document_versions SET organization_id = "
        "(SELECT documents.organization_id FROM documents "
        "WHERE documents.id = document_versions.document_id)"
    )

    with op.batch_alter_table("documents") as batch:
        batch.create_unique_constraint("uq_documents_id", ["id", "organization_id"])
    with op.batch_alter_table("file_objects") as batch:
        batch.create_unique_constraint("uq_file_objects_id", ["id", "organization_id"])
    with op.batch_alter_table("document_versions") as batch:
        batch.alter_column("organization_id", nullable=False)
        batch.create_index(
            "ix_document_versions_organization_id", ["organization_id"], unique=False
        )
        batch.create_foreign_key(
            "fk_document_versions_document_id_documents",
            "documents",
            ["document_id", "organization_id"],
            ["id", "organization_id"],
            ondelete="CASCADE",
        )
        batch.create_foreign_key(
            "fk_document_versions_file_id_file_objects",
            "file_objects",
            ["file_id", "organization_id"],
            ["id", "organization_id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("document_versions") as batch:
        batch.drop_constraint(
            "fk_document_versions_document_id_documents", type_="foreignkey"
        )
        batch.drop_constraint("fk_document_versions_file_id_file_objects", type_="foreignkey")
        batch.drop_index("ix_document_versions_organization_id")
        batch.create_foreign_key(
            "fk_document_versions_document_id_documents",
            "documents",
            ["document_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch.create_foreign_key(
            "fk_document_versions_file_id_file_objects",
            "file_objects",
            ["file_id"],
            ["id"],
        )
        batch.drop_column("organization_id")
    with op.batch_alter_table("file_objects") as batch:
        batch.drop_constraint("uq_file_objects_id", type_="unique")
    with op.batch_alter_table("documents") as batch:
        batch.drop_constraint("uq_documents_id", type_="unique")
