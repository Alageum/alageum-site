from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.dependencies import AuthContext, require_permission
from app.integrations.providers import MockCRMProvider, MockERPProvider

router = APIRouter(prefix="/integrations", tags=["Integrations"])


class MockIntegrationStatus(BaseModel):
    mode: str
    erp: str
    crm: str
    organization_external_id: str | None


@router.get("/status", response_model=MockIntegrationStatus)
async def status(
    context: AuthContext = Depends(require_permission("integration.read")),
):
    return MockIntegrationStatus(
        mode="mock",
        erp=MockERPProvider.__name__,
        crm=MockCRMProvider.__name__,
        organization_external_id=context.membership.organization.external_id,
    )
