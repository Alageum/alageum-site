import uuid
from typing import Annotated

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, BeforeValidator, Field

from app.core.schemas import APIRequest


def validate_email_address(value: str) -> str:
    try:
        return validate_email(value, check_deliverability=False, test_environment=True).normalized
    except EmailNotValidError as exc:
        raise ValueError(str(exc)) from exc


EmailAddress = Annotated[str, BeforeValidator(validate_email_address)]


class LoginRequest(APIRequest):
    email: EmailAddress
    password: str = Field(min_length=8, max_length=256)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(APIRequest):
    refresh_token: str


class InviteRequest(APIRequest):
    email: EmailAddress
    role_id: uuid.UUID


class TokenResponse(BaseModel):
    token: str
    expires_in: int


class InvitationAcceptRequest(APIRequest):
    display_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=12, max_length=256)


class ResetRequest(APIRequest):
    email: EmailAddress


class ResetConfirmRequest(APIRequest):
    token: str
    password: str = Field(min_length=12, max_length=256)


class UserInfo(BaseModel):
    id: uuid.UUID
    email: EmailAddress
    display_name: str


class OrganizationInfo(BaseModel):
    id: uuid.UUID
    name: str


class MeResponse(BaseModel):
    user: UserInfo
    organization: OrganizationInfo
    permissions: list[str]
