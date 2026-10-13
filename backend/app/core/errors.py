from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.core.redaction import REDACTED, is_sensitive_key, redact_sensitive, safe_request_path

logger = structlog.get_logger()


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, details: Any = None):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


def error_payload(request: Request, code: str, message: str, details: Any = None) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": redact_sensitive(details),
            "request_id": getattr(request.state, "request_id", None),
        }
    }


def safe_validation_errors(exc: RequestValidationError) -> list[dict[str, Any]]:
    result = []
    for raw in exc.errors():
        item = dict(raw)
        item.pop("ctx", None)
        if any(is_sensitive_key(str(part)) for part in item.get("loc", ())):
            item["input"] = REDACTED
        result.append(item)
    return result


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(request, exc.code, exc.message, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=error_payload(
                request, "validation_error", "Invalid request", safe_validation_errors(exc)
            ),
        )

    @app.exception_handler(HTTPException)
    async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == 404 else "http_error"
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(request, code, str(exc.detail)),
        )

    @app.exception_handler(Exception)
    async def internal_error_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "request.unhandled_error",
            request_id=getattr(request.state, "request_id", None),
            method=request.method,
            path=safe_request_path(request),
            exception_type=type(exc).__name__,
        )
        return JSONResponse(
            status_code=500,
            content=error_payload(request, "internal_error", "Internal server error"),
        )
