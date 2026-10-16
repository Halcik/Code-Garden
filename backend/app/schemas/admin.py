from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.schemas.auth import LoginRequest, RegisterRequest, UserResponse


class UserUpdate(BaseModel):
    """Identity fields only: roles, status and passwords cannot be patched."""
    model_config = ConfigDict(extra="forbid")
    login: Optional[str] = Field(default=None, min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$")
    email: Optional[EmailStr] = Field(default=None, max_length=254)

    @field_validator("login", mode="before")
    @classmethod
    def normalize_login(cls, value):
        return LoginRequest.normalize_login(value)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return RegisterRequest.normalize_email(value)

    @model_validator(mode="after")
    def nonempty_patch(self):
        if not self.model_fields_set:
            raise ValueError("Provide login or email")
        if "login" in self.model_fields_set and self.login is None:
            raise ValueError("Login cannot be null")
        return self


class UserList(BaseModel):
    items: list[UserResponse]
    total: int
    limit: int
    offset: int
