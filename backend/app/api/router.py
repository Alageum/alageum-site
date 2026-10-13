from fastapi import APIRouter

from app.ai.router import router as ai_router
from app.api.system import router as system_router
from app.auth.router import router as auth_router
from app.catalog.admin import router as catalog_admin_router
from app.catalog.router import router as catalog_router
from app.commerce.router import finance_router, orders_router, quotes_router, support_router
from app.content.router import admin_router as content_admin_router
from app.content.router import public_router as content_router
from app.documents.router import router as documents_router
from app.files.router import router as files_router
from app.identity.router import router as identity_router
from app.integrations.router import router as integrations_router

api_router = APIRouter()
api_router.include_router(system_router)
api_router.include_router(auth_router)
api_router.include_router(ai_router)
api_router.include_router(catalog_router)
api_router.include_router(catalog_admin_router)
api_router.include_router(files_router)
api_router.include_router(documents_router)
api_router.include_router(orders_router)
api_router.include_router(finance_router)
api_router.include_router(quotes_router)
api_router.include_router(support_router)
api_router.include_router(integrations_router)
api_router.include_router(identity_router)
api_router.include_router(content_router)
api_router.include_router(content_admin_router)
