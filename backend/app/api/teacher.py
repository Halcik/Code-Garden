from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import check_origin, require_role
from app.db.session import get_db
from app.models.task import Task, TaskDifficulty, TaskStatus
from app.models.user import User, UserRole
from app.schemas.task import TaskArchiveRequest, TaskCreate, TaskList, TaskResponse, TaskUpdate

router = APIRouter(prefix="/teacher", tags=["teacher tasks"])


@router.get("/tasks", response_model=TaskList)
def list_tasks(
    response: Response,
    archived: bool | None = None,
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
    if archived is not None:
        filters.append(Task.is_archived == archived)
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


@router.post("/tasks", response_model=TaskResponse, status_code=201, dependencies=[Depends(check_origin)])
def create_task(
    payload: TaskCreate,
    response: Response,
    author: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    task = Task(**payload.model_dump(), author_id=author.id)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def owned_task(db: Session, task_id: int, author_id: int, lock: bool = False) -> Task:
    query = select(Task).where(Task.id == task_id, Task.author_id == author_id)
    task = db.scalar(query.with_for_update() if lock else query)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int,
    response: Response,
    author: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    return owned_task(db, task_id, author.id)


@router.patch("/tasks/{task_id}", response_model=TaskResponse, dependencies=[Depends(check_origin)])
def update_task(
    task_id: int,
    payload: TaskUpdate,
    response: Response,
    author: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    task = owned_task(db, task_id, author.id, lock=True)
    if task.is_archived:
        raise HTTPException(status_code=409, detail="Archived tasks are read-only. Restore the task first.")
    for name, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, name, value)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/tasks/{task_id}/archive", response_model=TaskResponse, dependencies=[Depends(check_origin)])
def archive_task(
    task_id: int,
    response: Response,
    payload: TaskArchiveRequest | None = None,
    author: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    return set_archived(db, task_id, author.id, True, response)


@router.patch("/tasks/{task_id}/restore", response_model=TaskResponse, dependencies=[Depends(check_origin)])
def restore_task(
    task_id: int,
    response: Response,
    payload: TaskArchiveRequest | None = None,
    author: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    return set_archived(db, task_id, author.id, False, response)


def set_archived(db: Session, task_id: int, author_id: int, archived: bool, response: Response):
    response.headers["Cache-Control"] = "no-store"
    task = owned_task(db, task_id, author_id, lock=True)
    if task.is_archived != archived:
        task.is_archived = archived
    db.commit()
    db.refresh(task)
    return task
