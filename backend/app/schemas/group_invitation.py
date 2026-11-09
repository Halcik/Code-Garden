from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class InviteStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    login: str = Field(min_length=1, max_length=50)


class GenerateCode(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    value: int = Field(ge=1, le=720)
    unit: Literal["hours", "days"]

    @model_validator(mode="after")
    def valid_duration(self):
        if self.hours > 720:
            raise ValueError("Code validity must be between 1 hour and 30 days")
        return self

    @property
    def hours(self) -> int:
        return self.value * (24 if self.unit == "days" else 1)


class JoinByCode(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    code: str = Field(min_length=1, max_length=64)


class StudentIdentity(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    login: str


class InvitationResponse(BaseModel):
    id: int
    group_id: int
    group_name: str
    teacher_login: str
    student_id: int
    student_login: str
    status: Literal["PENDING", "ACCEPTED", "REJECTED"]
    created_at: datetime


class InvitationCodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    code: str
    created_at: datetime
    expires_at: datetime


class StudentGroupResponse(BaseModel):
    id: int
    name: str
    description: str | None
    age_range: str | None
    teacher_login: str
    student_count: int
    created_at: datetime
