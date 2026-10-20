from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.dependencies import require_role
from app.db.session import get_db
from app.models.task import Task, TaskDifficulty, TaskStatus, TaskType
from app.models.user import UserRole
from app.schemas.task import StudentTaskList
from app.services.task_catalog import task_filters, task_page

router = APIRouter(prefix="/student", tags=["student tasks"],
                   dependencies=[Depends(require_role(UserRole.STUDENT))])


@router.get("/tasks", response_model=StudentTaskList)
def list_student_tasks(
    response: Response,
    search: str | None = Query(None, max_length=200),
    topic: str | None = Query(None, max_length=100),
    difficulty: TaskDifficulty | None = None,
    task_type: TaskType | None = None,
    sort_by: Literal["created_at", "updated_at", "title"] = "created_at",
    sort_order: Literal["asc", "desc"] = "desc",
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    filters = [Task.status == TaskStatus.READY, Task.is_archived.is_(False)]
    filters.extend(task_filters(search=search, topic=topic, difficulty=difficulty, task_type=task_type))
    return task_page(db, filters, sort_by=sort_by, sort_order=sort_order, limit=limit, offset=offset)
