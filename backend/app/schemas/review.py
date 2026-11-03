from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ReviewResponse(BaseModel):
    status: Literal["PENDING", "ACCEPTED", "CHANGES_REQUESTED"] = "PENDING"
    feedback: str = ""
    reviewed_at: datetime | None = None


class ReviewWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["ACCEPTED", "CHANGES_REQUESTED"]
    feedback: str = Field(default="", max_length=10000)

    @field_validator("feedback")
    @classmethod
    def clean(cls, value):
        return value.strip()

    @model_validator(mode="after")
    def require_feedback(self):
        if self.decision == "CHANGES_REQUESTED" and not self.feedback:
            raise ValueError("Feedback is required when requesting changes")
        return self


class NoteWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(max_length=10000)

    @field_validator("content")
    @classmethod
    def clean(cls, value):
        return value.strip()


class NoteResponse(BaseModel):
    student_id: int
    content: str
    updated_at: datetime | None = None
