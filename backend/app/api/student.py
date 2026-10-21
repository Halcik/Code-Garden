from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import check_origin, require_role
from app.db.session import get_db
from app.core.config import get_settings
from app.schemas.execution import RunRequest, RunResponse
from app.services.judge0 import Judge0Service, Judge0Error
from app.models.task import Task, TaskDifficulty, TaskHint, TaskStatus, TaskType
from app.models.user import UserRole
from app.schemas.task import StudentTaskDetail, StudentTaskList
from app.schemas.task_hint import StudentHintResponse, StudentHintSummary
from app.services.task_catalog import task_filters, task_page

router = APIRouter(prefix="/student", tags=["student tasks"],
                   dependencies=[Depends(require_role(UserRole.STUDENT))])


def visible_student_tasks():
    return [Task.status == TaskStatus.READY, Task.is_archived.is_(False)]


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
    filters = visible_student_tasks()
    filters.extend(task_filters(search=search, topic=topic, difficulty=difficulty, task_type=task_type))
    return task_page(db, filters, sort_by=sort_by, sort_order=sort_order, limit=limit, offset=offset)


@router.get("/tasks/{task_id}", response_model=StudentTaskDetail)
def get_student_task(task_id: int, response: Response, db: Session = Depends(get_db)):
    return available_student_task(db, task_id, response)


def available_student_task(db: Session, task_id: int, response: Response):
    response.headers["Cache-Control"] = "no-store"
    task = db.scalar(select(Task).where(Task.id == task_id, *visible_student_tasks()))
    if task is None:
        raise HTTPException(404, "Task not found", headers={"Cache-Control": "no-store"})
    return task


@router.get("/tasks/{task_id}/hints", response_model=StudentHintSummary)
def student_hint_summary(task_id: int, response: Response, db: Session = Depends(get_db)):
    available_student_task(db, task_id, response)
    return {"total": db.scalar(select(func.count()).select_from(TaskHint).where(TaskHint.task_id == task_id))}


@router.get("/tasks/{task_id}/hints/{number}", response_model=StudentHintResponse)
def get_student_hint(task_id: int, number: int, response: Response, db: Session = Depends(get_db)):
    available_student_task(db, task_id, response)
    if number < 1:
        raise HTTPException(404, "Hint not found", headers={"Cache-Control": "no-store"})
    # Select one hint by its ordinal in the teacher's current order (positions can have gaps).
    hint = db.scalar(select(TaskHint).where(TaskHint.task_id == task_id)
                     .order_by(TaskHint.position, TaskHint.id).offset(number - 1).limit(1))
    if hint is None:
        raise HTTPException(404, "Hint not found", headers={"Cache-Control": "no-store"})
    return {"number": number, "title": hint.title, "content": hint.content}


def get_judge0_service():
    return Judge0Service(get_settings())


@router.post("/tasks/{task_id}/run", response_model=RunResponse, dependencies=[Depends(check_origin)])
async def run_student_code(task_id: int, payload: RunRequest, response: Response,
                           db: Session = Depends(get_db), service: Judge0Service = Depends(get_judge0_service)):
    task = available_student_task(db, task_id, response)
    try:
        return await service.run_code(source_code=payload.source_code, stdin=payload.stdin,
                                      python_version=task.python_version, time_limit_seconds=task.time_limit_seconds,
                                      memory_limit_mb=task.memory_limit_mb)
    except Judge0Error as exc:
        raise HTTPException(exc.status_code, exc.message, headers={"Cache-Control": "no-store"}) from None
