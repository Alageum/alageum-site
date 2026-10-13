from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.database import AsyncSessionFactory
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.core.request_limits import RequestBodyLimitMiddleware
from app.integrations.service import IntegrationJobService

settings = get_settings()
configure_logging(settings.debug)
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with AsyncSessionFactory() as session:
        recovered = await IntegrationJobService(session).recover_stale_jobs()
    logger.info("application.started", environment=settings.env, version=settings.version)
    if recovered:
        logger.warning("integration_jobs.recovered", count=len(recovered))
    yield
    logger.info("application.stopped")


app = FastAPI(
    title=settings.name,
    version=settings.version,
    description="Modular multi-tenant B2B platform API.",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Request-ID",
        "X-Organization-ID",
        "Idempotency-Key",
    ],
)
app.add_middleware(RequestBodyLimitMiddleware, max_bytes=settings.max_request_bytes)
app.add_middleware(RequestContextMiddleware)
register_error_handlers(app)
app.include_router(api_router, prefix=settings.api_prefix)
