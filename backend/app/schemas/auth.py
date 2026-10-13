from typing import Literal, Optional
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.user import UserRole


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    login: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)

    @field_validator("login", mode="before")
    @classmethod
    def normalize_login(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class RegisterRequest(LoginRequest):
    email: Optional[EmailStr] = Field(default=None, max_length=254)
    role: Literal[UserRole.STUDENT, UserRole.TEACHER] = UserRole.STUDENT

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value

    @model_validator(mode="after")
    def teacher_requires_email(self):
        if self.role == UserRole.TEACHER and self.email is None:
            raise ValueError("Email is required for TEACHER")
        return self


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    login: str
    email: Optional[str]
    role: UserRole
    created_at: datetime
