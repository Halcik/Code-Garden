from datetime import datetime

from pydantic import BaseModel, ConfigDict

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
    author_id: int
    created_at: datetime
    updated_at: datetime


class TaskList(BaseModel):
    items: list[TaskResponse]
    total: int
    limit: int
    offset: int
