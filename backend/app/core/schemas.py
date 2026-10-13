from pydantic import BaseModel, ConfigDict


class APIRequest(BaseModel):
    """Request DTOs reject unknown fields to prevent silent mass assignment."""

    model_config = ConfigDict(extra="forbid")
