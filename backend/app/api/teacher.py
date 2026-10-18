from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from pydantic import ValidationError

from app.api.dependencies import check_origin, require_role
from app.db.session import get_db
from app.models.task import Task, TaskDifficulty, TaskStatus, TaskTest, TaskHint
from app.models.user import User, UserRole
from app.schemas.task import TaskArchiveRequest, TaskCreate, TaskList, TaskResponse, TaskUpdate
from app.schemas.task_test import TaskTestWrite, TaskTestPatch, TaskTestResponse, TaskTestReorder

from app.schemas.task_hint import TaskHintWrite, TaskHintPatch, TaskHintResponse, TaskHintReorder

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
    status = payload.status if "status" in payload.model_fields_set else task.status
    instructions = payload.instructions if "instructions" in payload.model_fields_set else task.instructions
    if status == TaskStatus.READY and not (instructions or "").strip():
        raise HTTPException(status_code=422, detail="Ready tasks require instructions")
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


# Lock the parent for every mutation, including archive, to serialize ordering changes.


def task_child_parent(db, task_id, author_id, response, write=False):
    response.headers["Cache-Control"] = "no-store"
    task = owned_task(db, task_id, author_id, lock=write)
    if write and task.is_archived:
        raise HTTPException(409, "Archived tasks are read-only. Restore the task first.")
    return task


def ordered_tests(db, task_id):
    return list(db.scalars(select(TaskTest).where(TaskTest.task_id == task_id).order_by(TaskTest.position, TaskTest.id)))


@router.get("/tasks/{task_id}/tests", response_model=list[TaskTestResponse])
def list_tests(task_id: int, response: Response, author: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    task_child_parent(db, task_id, author.id, response)
    return ordered_tests(db, task_id)


@router.post("/tasks/{task_id}/tests", response_model=TaskTestResponse, status_code=201, dependencies=[Depends(check_origin)])
def create_test(task_id: int, payload: TaskTestWrite, response: Response, author: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    task_child_parent(db, task_id, author.id, response, True)
    item = TaskTest(task_id=task_id, position=len(ordered_tests(db, task_id)) + 1, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/tasks/{task_id}/tests/reorder", response_model=list[TaskTestResponse], dependencies=[Depends(check_origin)])
def reorder_tests(task_id: int, payload: TaskTestReorder, response: Response, author: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    task_child_parent(db, task_id, author.id, response, True)
    items = ordered_tests(db, task_id)
    by_id = {item.id: item for item in items}
    if len(payload.test_ids) != len(by_id) or set(payload.test_ids) != set(by_id):
        raise HTTPException(422, "Provide every test ID exactly once")
    for position, test_id in enumerate(payload.test_ids, 1):
        by_id[test_id].position = position
    db.commit()
    return ordered_tests(db, task_id)


def find_test(db, task_id, test_id):
    item = db.scalar(select(TaskTest).where(TaskTest.task_id == task_id, TaskTest.id == test_id))
    if item is None:
        raise HTTPException(404, "Test not found")
    return item


@router.patch("/tasks/{task_id}/tests/{test_id}", response_model=TaskTestResponse, dependencies=[Depends(check_origin)])
def update_test(task_id: int, test_id: int, payload: TaskTestPatch, response: Response, author: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    task_child_parent(db, task_id, author.id, response, True)
    item = find_test(db, task_id, test_id)
    data = {key: getattr(item, key) for key in ("name", "test_type", "config", "is_hidden")}
    data.update(payload.model_dump(exclude_unset=True))
    try:
        validated = TaskTestWrite.model_validate(data)
    except ValidationError:
        raise HTTPException(422, "Invalid test configuration")
    for key, value in validated.model_dump().items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/tasks/{task_id}/tests/{test_id}", status_code=204, dependencies=[Depends(check_origin)])
def delete_test(task_id: int, test_id: int, response: Response, author: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    task_child_parent(db, task_id, author.id, response, True)
    db.delete(find_test(db, task_id, test_id))
    db.flush()
    for position, item in enumerate(ordered_tests(db, task_id), 1):
        item.position = position
    db.commit()


def ordered_hints(db, task_id):
    return list(db.scalars(select(TaskHint).where(TaskHint.task_id == task_id).order_by(TaskHint.position, TaskHint.id)))


@router.get("/tasks/{task_id}/hints", response_model=list[TaskHintResponse])
def list_hints(task_id: int, response: Response, author: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    task_child_parent(db, task_id, author.id, response)
    return ordered_hints(db, task_id)


@router.post("/tasks/{task_id}/hints", response_model=TaskHintResponse, status_code=201, dependencies=[Depends(check_origin)])
def create_hint(task_id: int, payload: TaskHintWrite, response: Response, author: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    task_child_parent(db, task_id, author.id, response, True)
    item = TaskHint(task_id=task_id, position=len(ordered_hints(db, task_id)) + 1, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/tasks/{task_id}/hints/reorder", response_model=list[TaskHintResponse], dependencies=[Depends(check_origin)])
def reorder_hints(task_id: int, payload: TaskHintReorder, response: Response, author: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    task_child_parent(db, task_id, author.id, response, True)
    items = ordered_hints(db, task_id)
    by_id = {item.id: item for item in items}
    if len(payload.hint_ids) != len(by_id) or set(payload.hint_ids) != set(by_id):
        raise HTTPException(422, "Provide every hint ID exactly once")
    for position, hint_id in enumerate(payload.hint_ids, 1):
        by_id[hint_id].position = position
    db.commit()
    return ordered_hints(db, task_id)


def find_hint(db, task_id, hint_id):
    item = db.scalar(select(TaskHint).where(TaskHint.task_id == task_id, TaskHint.id == hint_id))
    if item is None:
        raise HTTPException(404, "Hint not found")
    return item


@router.patch("/tasks/{task_id}/hints/{hint_id}", response_model=TaskHintResponse, dependencies=[Depends(check_origin)])
def update_hint(task_id: int, hint_id: int, payload: TaskHintPatch, response: Response, author: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    task_child_parent(db, task_id, author.id, response, True)
    item = find_hint(db, task_id, hint_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/tasks/{task_id}/hints/{hint_id}", status_code=204, dependencies=[Depends(check_origin)])
def delete_hint(task_id: int, hint_id: int, response: Response, author: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    task_child_parent(db, task_id, author.id, response, True)
    db.delete(find_hint(db, task_id, hint_id))
    db.flush()
    for position, item in enumerate(ordered_hints(db, task_id), 1):
        item.position = position
    db.commit()
