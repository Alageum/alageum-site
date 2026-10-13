from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.commerce.models import OrderItem
from app.core.database import AsyncSessionFactory
from app.documents.models import DocumentVersion
from app.identity.models import Membership
from tests.factories import tenant_fixture


async def test_membership_uniqueness_is_enforced_by_database():
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
        session.add(
            Membership(
                user_id=data["user_a"].id,
                organization_id=data["org_a"].id,
                role_id=data["role_a"].id,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()


async def test_positive_quantity_and_document_version_are_database_invariants():
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
        document_id = data["document_b"].id
        file_id = data["file_b"].id
        organization_id = data["org_b"].id
        session.add(
            OrderItem(
                order_id=data["order_a"].id,
                description="invalid",
                quantity=Decimal("0"),
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
        session.add(
            DocumentVersion(
                organization_id=organization_id,
                document_id=document_id,
                file_id=file_id,
                version=0,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()


async def test_document_version_cannot_reference_file_from_another_tenant():
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
        session.add(
            DocumentVersion(
                organization_id=data["org_a"].id,
                document_id=data["document_a"].id,
                file_id=data["file_b"].id,
                version=2,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()
