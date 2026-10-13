from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.core.metrics import metrics

router = APIRouter(tags=["System"])


class HealthResponse(BaseModel):
    status: str
    timestamp: datetime


class ReadinessResponse(HealthResponse):
    database: str


class VersionResponse(BaseModel):
    name: str
    version: str
    environment: str


@router.get("/health", response_model=HealthResponse, summary="Process liveness")
async def health() -> HealthResponse:
    return HealthResponse(status="ok", timestamp=datetime.now(UTC))


@router.get("/readiness", response_model=ReadinessResponse, summary="Service readiness")
async def readiness(session: AsyncSession = Depends(get_session)) -> ReadinessResponse:
    await session.execute(text("SELECT 1"))
    return ReadinessResponse(status="ok", database="ok", timestamp=datetime.now(UTC))


@router.get("/metrics", include_in_schema=False, summary="DEV metrics snapshot")
async def metric_snapshot() -> Response:
    import json

    return Response(json.dumps(metrics.snapshot(), sort_keys=True), media_type="application/json")


@router.get("/version", response_model=VersionResponse, summary="Build information")
async def version(settings: Settings = Depends(get_settings)) -> VersionResponse:
    return VersionResponse(name=settings.name, version=settings.version, environment=settings.env)
