from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AssignStudent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: int = Field(gt=0)


class AssignGroup(BaseModel):
    model_config = ConfigDict(extra="forbid")
    group_id: int = Field(gt=0)


class AssignmentResponse(BaseModel):
    id: int
    task_id: int
    student_id: int
    student_login: str
    assigned_by_teacher_id: int
    group_id: int | None
    source_group_id: int | None
    group_name: str | None
    created_at: datetime


class GroupAssignmentResponse(BaseModel):
    total_students: int
    assigned_count: int
    already_assigned_count: int


class AssignmentStudent(BaseModel):
    id: int
    login: str


class GroupTaskAssignment(BaseModel):
    task_id: int
    title: str
    topic: str
    difficulty: str
    is_archived: bool
    student_count: int
    created_at: datetime
