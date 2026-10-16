from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.task import TaskDifficulty, TaskStatus, TaskType


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    topic: str
    difficulty: TaskDifficulty
    task_type: TaskType
    status: TaskStatus
    estimated_time_minutes: int | None
    is_archived: bool
    author_id: int
    created_at: datetime
    updated_at: datetime


class TaskList(BaseModel):
    items: list[TaskResponse]
    total: int
    limit: int
    offset: int


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=1, max_length=100)
    difficulty: TaskDifficulty
    task_type: TaskType
    status: TaskStatus = TaskStatus.DRAFT
    description: str = ""
    estimated_time_minutes: int | None = Field(default=None, gt=0, le=2147483647)


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str | None = Field(default=None, min_length=1, max_length=200)
    topic: str | None = Field(default=None, min_length=1, max_length=100)
    difficulty: TaskDifficulty | None = None
    task_type: TaskType | None = None
    status: TaskStatus | None = None
    description: str | None = None
    estimated_time_minutes: int | None = Field(default=None, gt=0, le=2147483647)

    @model_validator(mode="after")
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one field")
        for name in self.model_fields_set - {"estimated_time_minutes"}:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class TaskArchiveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
