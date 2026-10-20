from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, model_validator


class TaskHintWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)


class TaskHintPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def check_patch(self):
        if not self.model_fields_set or any(getattr(self, key) is None for key in self.model_fields_set):
            raise ValueError("Provide non-null fields")
        return self


class TaskHintResponse(TaskHintWrite):
    model_config = ConfigDict(from_attributes=True)
    id: int
    task_id: int
    position: int
    created_at: datetime
    updated_at: datetime


class TaskHintReorder(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    hint_ids: list[int]


class StudentHintSummary(BaseModel):
    total: int


class StudentHintResponse(BaseModel):
    number: int
    title: str
    content: str
