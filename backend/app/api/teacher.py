from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import require_role
from app.db.session import get_db
from app.models.task import Task, TaskDifficulty, TaskStatus
from app.models.user import User, UserRole
from app.schemas.task import TaskList

router = APIRouter(prefix="/teacher", tags=["teacher tasks"])


@router.get("/tasks", response_model=TaskList)
def list_tasks(
    response: Response,
    difficulty: TaskDifficulty | None = None,
    status: TaskStatus | None = None,
    topic: str | None = Query(None, max_length=100),
    q: str | None = Query(None, max_length=200),
    sort_by: Literal["created_at", "updated_at", "title"] = "updated_at",
    sort_order: Literal["asc", "desc"] = "desc",
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    author: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    filters = [Task.author_id == author.id]
    if difficulty is not None:
        filters.append(Task.difficulty == difficulty)
    if status is not None:
        filters.append(Task.status == status)
    if topic and topic.strip():
        filters.append(func.lower(Task.topic) == topic.strip().lower())
    if q and q.strip():
        filters.append(Task.title.icontains(q.strip(), autoescape=True))
    column = getattr(Task, sort_by)
    ordering = column.asc() if sort_order == "asc" else column.desc()
    total = db.scalar(select(func.count()).select_from(Task).where(*filters))
    items = db.scalars(select(Task).where(*filters).order_by(ordering, Task.id.asc())
                       .limit(limit).offset(offset)).all()
    return {"items": items, "total": total, "limit": limit, "offset": offset}
