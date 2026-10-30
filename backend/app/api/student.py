from typing import Literal
from copy import deepcopy
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import check_origin, require_role, get_current_user
from app.db.session import get_db
from app.core.config import get_settings
from app.schemas.execution import RunRequest, RunResponse
from app.services.judge0 import Judge0Service, Judge0Error
from app.models.task import Task, TaskDifficulty, TaskHint, TaskStatus, TaskType, TaskTest
from app.schemas.solution_check import CheckRequest, CheckResponse
from app.services.solution_check import check_solution
from app.models.user import UserRole, User
from app.models.solution import SolutionDraft, DraftUsedHint, Submission, SubmissionUsedHint
from app.schemas.solution import DraftWrite, SubmitRequest
from app.services import solutions
from sqlalchemy.dialects.postgresql import insert
from pydantic import ValidationError
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
    user: User = Depends(get_current_user),
    progress_status: Literal["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] | None = None,
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
    return task_page(db, filters, sort_by=sort_by, sort_order=sort_order, limit=limit, offset=offset,
                     student_id=user.id, progress_status=progress_status)


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
def student_hint_summary(task_id: int, response: Response, db: Session = Depends(get_db),
                         user: User = Depends(get_current_user)):
    available_student_task(db, task_id, response)
    hints = list(db.scalars(select(TaskHint).where(TaskHint.task_id == task_id).order_by(TaskHint.position, TaskHint.id)))
    used = set(db.scalars(select(DraftUsedHint.hint_id).join(SolutionDraft).where(
        SolutionDraft.student_id == user.id, SolutionDraft.task_id == task_id)))
    return dict(total=len(hints), revealed=[dict(number=n, title=h.title, content=h.content)
        for n, h in enumerate(hints, 1) if h.id in used])


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


def captured_runtime(task):
    return SimpleNamespace(**{key: getattr(task, key) for key in
        ("python_version", "time_limit_seconds", "memory_limit_mb")})


def captured_tests(db, task_id):
    # Copy definitions before releasing the transaction: teacher edits cannot
    # change the definitions midway through a check or its historical snapshot.
    return [SimpleNamespace(**{key: deepcopy(getattr(t, key)) for key in
        ("id", "name", "test_type", "config", "is_hidden", "position")})
        for t in db.scalars(select(TaskTest).where(TaskTest.task_id == task_id)
                          .order_by(TaskTest.position, TaskTest.id))]


@router.get("/tasks/{task_id}/draft")
def get_draft(task_id: int, response: Response, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    task = available_student_task(db, task_id, response)
    return solutions.public_draft(db, solutions.draft_for(db, user.id, task))


@router.put("/tasks/{task_id}/draft", dependencies=[Depends(check_origin)])
def put_draft(task_id: int, payload: DraftWrite, response: Response, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    task = available_student_task(db, task_id, response)
    draft = solutions.draft_for(db, user.id, task)
    draft = solutions.save_code(db, draft, payload.source_code, payload.revision)
    return solutions.public_draft(db, draft)


@router.post("/tasks/{task_id}/hints/{number}/reveal", response_model=StudentHintResponse,
             dependencies=[Depends(check_origin)])
def reveal_hint(task_id: int, number: int, response: Response, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    task = available_student_task(db, task_id, response)
    hint = db.scalar(select(TaskHint).where(TaskHint.task_id == task_id)
        .order_by(TaskHint.position, TaskHint.id).offset(max(0, number - 1)).limit(1))
    if number < 1 or hint is None:
        raise HTTPException(404, "Hint not found")
    draft = solutions.draft_for(db, user.id, task)
    db.execute(insert(DraftUsedHint).values(draft_id=draft.id, hint_id=hint.id)
        .on_conflict_do_nothing(index_elements=["draft_id", "hint_id"]))
    db.commit()
    return dict(number=number, title=hint.title, content=hint.content)


@router.get("/tasks/{task_id}/revealed-hints")
def revealed_hints(task_id: int, response: Response, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    task = available_student_task(db, task_id, response)
    draft = solutions.draft_for(db, user.id, task)
    used = {h.hint_id for h in solutions.used_hints(db, draft.id)}
    hints = db.scalars(select(TaskHint).where(TaskHint.task_id == task_id).order_by(TaskHint.position, TaskHint.id))
    return [dict(number=n, title=h.title, content=h.content) for n, h in enumerate(hints, 1) if h.id in used]


@router.post("/tasks/{task_id}/check", response_model=CheckResponse, response_model_exclude_none=True,
             dependencies=[Depends(check_origin)])
async def check_student_solution(task_id: int, payload: CheckRequest, response: Response,
        db: Session = Depends(get_db), service: Judge0Service = Depends(get_judge0_service),
        user: User = Depends(get_current_user)):
    task = available_student_task(db, task_id, response)
    tests = captured_tests(db, task_id)
    runtime = captured_runtime(task)
    draft = solutions.draft_for(db, user.id, task)
    if payload.revision is None:
        draft = solutions.save_code(db, draft, payload.source_code)
    draft = solutions.locked_draft(db, draft.id)
    # Count each check attempt; completion only replaces the newest check.
    draft.check_count += 1
    check_number, draft_id = draft.check_count, draft.id
    db.commit()
    try:
        result = await check_solution(runtime, tests, payload.source_code, service)
    except Judge0Error as exc:
        raise HTTPException(exc.status_code, exc.message, headers={"Cache-Control": "no-store"}) from None
    draft = solutions.locked_draft(db, draft_id)
    if draft.check_count == check_number:
        solutions.store_check(db, draft, tests, result, payload.source_code)
    db.commit()
    return result


@router.post("/tasks/{task_id}/submissions", status_code=201, dependencies=[Depends(check_origin)])
async def submit_solution(task_id: int, payload: SubmitRequest, response: Response,
        db: Session = Depends(get_db), service: Judge0Service = Depends(get_judge0_service),
        user: User = Depends(get_current_user)):
    task = available_student_task(db, task_id, response)
    tests = captured_tests(db, task_id)
    runtime = captured_runtime(task)
    draft = solutions.draft_for(db, user.id, task)
    if payload.revision != draft.revision:
        raise HTTPException(409, "Draft changed. Save and retry.")
    source, draft_id, student_id = draft.source_code, draft.id, user.id
    check_number = draft.check_count
    try:
        CheckRequest(source_code=source)
    except ValidationError:
        raise HTTPException(422, "Source code must contain between 1 byte and 100 KB") from None
    hints = [dict(hint_id=h.hint_id, revealed_at=h.revealed_at, reveal_order=n)
             for n, h in enumerate(solutions.used_hints(db, draft_id), 1)]
    # Do not keep a row lock or database transaction open during remote execution.
    db.commit()
    try:
        result = await check_solution(runtime, tests, source, service)
    except Judge0Error as exc:
        raise HTTPException(exc.status_code, exc.message, headers={"Cache-Control": "no-store"}) from None
    try:
        draft = solutions.locked_draft(db, draft_id)
        submission = Submission(student_id=student_id, task_id=task_id, version=draft.next_version,
                                source_code=source, summary=solutions.summary(result))
        draft.next_version += 1
        draft.check_count += 1
        db.add(submission)
        db.flush()
        for hint in hints:
            db.add(SubmissionUsedHint(submission_id=submission.id, **hint))
        solutions.store_results(db, tests, result, submission_id=submission.id)
        if draft.check_count == check_number + 1:
            solutions.store_check(db, draft, tests, result, source)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return dict(submission=solutions.public_submission(submission), draft=solutions.public_draft(db, draft))


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
