from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.task import TaskDifficulty, TaskStatus, TaskType
from app.schemas.task_test import TaskTestWrite
from app.schemas.task_hint import TaskHintWrite


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    theory: str | None
    instructions: str | None
    starter_code: str | None
    python_version: str
    time_limit_seconds: float
    memory_limit_mb: int
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


class StudentTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    topic: str
    difficulty: TaskDifficulty
    task_type: TaskType
    estimated_time_minutes: int | None


class StudentTaskDetail(StudentTaskResponse):
    theory: str | None
    instructions: str | None
    starter_code: str | None


class StudentTaskList(BaseModel):
    items: list[StudentTaskResponse]
    total: int
    limit: int
    offset: int


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    tests: list[TaskTestWrite] = Field(default_factory=list)
    hints: list[TaskHintWrite] = Field(default_factory=list)

    python_version: str = "3.13"
    time_limit_seconds: float = Field(default=2, gt=0, le=15, allow_inf_nan=False)
    memory_limit_mb: int = Field(default=256, gt=0, le=512)

    @field_validator("python_version")
    @classmethod
    def supported_python(cls, value):
        from app.core.config import get_settings
        if value not in get_settings().judge0_python_languages:
            raise ValueError("Unsupported Python version")
        return value

    title: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=1, max_length=100)
    difficulty: TaskDifficulty
    task_type: TaskType
    status: TaskStatus = TaskStatus.DRAFT
    description: str = ""
    theory: str | None = None
    instructions: str | None = None
    starter_code: str | None = None

    @model_validator(mode="after")
    def validate_ready(self):
        if self.status == TaskStatus.READY and not (self.instructions or "").strip():
            raise ValueError("Ready tasks require instructions")
        return self

    @field_validator("title", "topic", "description", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    estimated_time_minutes: int | None = Field(default=None, gt=0, le=2147483647)


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    python_version: str | None = None
    time_limit_seconds: float | None = Field(default=None, gt=0, le=15, allow_inf_nan=False)
    memory_limit_mb: int | None = Field(default=None, gt=0, le=512)
    supported_python = field_validator("python_version")(TaskCreate.supported_python.__func__)

    title: str | None = Field(default=None, min_length=1, max_length=200)
    topic: str | None = Field(default=None, min_length=1, max_length=100)
    difficulty: TaskDifficulty | None = None
    task_type: TaskType | None = None
    status: TaskStatus | None = None
    description: str | None = None
    theory: str | None = None
    instructions: str | None = None
    starter_code: str | None = None

    @field_validator("title", "topic", "description", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    estimated_time_minutes: int | None = Field(default=None, gt=0, le=2147483647)

    @model_validator(mode="after")
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one field")
        for name in self.model_fields_set - {"estimated_time_minutes", "theory", "instructions", "starter_code"}:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class TaskArchiveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
