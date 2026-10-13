from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"), env_prefix="APP_", extra="ignore"
    )

    name: str = "ALAGEUM API"
    env: str = "development"
    debug: bool = False
    version: str = "0.1.0"
    api_prefix: str = "/api/v1"
    secret_key: str = ""
    database_url: str = "sqlite+aiosqlite:///./alageum.db"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    browser_token_transport: Literal["session_storage"] = "session_storage"
    jwt_issuer: str = "alageum-api"
    jwt_audience: str = "alageum-platform"
    storage_backend: str = "local"
    file_scanner_backend: str = "noop"
    local_storage_path: Path = Path("./storage")
    max_upload_bytes: int = 10 * 1024 * 1024
    max_request_bytes: int = 12 * 1024 * 1024
    ai_max_input_length: int = 10_000
    catalog_allowed_currencies: list[str] = Field(default_factory=list)
    default_page_size: int = 50
    max_page_size: int = 100
    ai_confirmation_minutes: int = 10
    integration_job_lease_seconds: int = 300
    rate_limit_backend: str = "memory"
    rate_limit_max_keys: int = 10_000
    rate_limit_requests: dict[str, int] = Field(
        default_factory=lambda: {
            "login": 30,
            "password_reset": 5,
            "ai_chat": 30,
            "file_upload": 20,
            "public_form": 10,
            "quote_create": 10,
        }
    )
    trusted_proxy_ips: list[str] = Field(default_factory=list)
    default_locale: str = "ru"
    available_locales: list[str] = Field(default_factory=lambda: ["ru", "kk", "en", "zh", "uz"])
    fallback_locale: str = "ru"

    @field_validator("secret_key")
    @classmethod
    def secure_secret_outside_tests(cls, value: str) -> str:
        if not value:
            raise ValueError("secret_key must not be empty")
        return value

    @model_validator(mode="after")
    def validate_production_configuration(self):
        if self.env == "production":
            if (
                len(self.secret_key) < 32
                or "development" in self.secret_key.lower()
                or "change-me" in self.secret_key.lower()
            ):
                raise ValueError("Production secret_key must be a non-placeholder random secret")
            if self.debug:
                raise ValueError("Debug mode is forbidden in production")
            if self.database_url.startswith("sqlite"):
                raise ValueError("Production requires PostgreSQL")
            if self.rate_limit_backend == "memory":
                raise ValueError("Production requires a distributed rate limiter")
            if self.file_scanner_backend == "noop":
                raise ValueError("Production requires an enabled file scanner")
            if self.browser_token_transport == "session_storage":
                raise ValueError(
                    "Production browser token transport requires an approved "
                    "HttpOnly cookie/BFF topology"
                )
        if self.max_request_bytes < self.max_upload_bytes:
            raise ValueError("max_request_bytes must be at least max_upload_bytes")
        if self.integration_job_lease_seconds < 10:
            raise ValueError("integration_job_lease_seconds must be at least 10")
        if "*" in self.cors_origins:
            raise ValueError("Wildcard CORS is incompatible with credentialed requests")
        if self.default_locale not in self.available_locales:
            raise ValueError("default_locale must be included in available_locales")
        if self.fallback_locale not in self.available_locales:
            raise ValueError("fallback_locale must be included in available_locales")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
