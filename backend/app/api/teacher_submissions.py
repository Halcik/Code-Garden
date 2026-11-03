"""Read-only access to formal snapshots, scoped to the task's owner."""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, func, or_
from typing import Literal
from sqlalchemy.orm import Session, load_only

from app.api.dependencies import require_role
from app.api.teacher import owned_task
from app.db.session import get_db
from app.models.solution import Submission, SubmissionUsedHint, SolutionTestResult
from app.models.task import Task, TaskHint
from app.models.user import User, UserRole
from app.schemas.teacher_submission import SubmissionPage, SubmissionHistory, SubmissionDetail, SubmissionQueue
from app.services.solutions import public_submission
from app.models.review import SubmissionReview
from app.services.reviews import review_map

router = APIRouter(prefix="/teacher", tags=["teacher submissions"])
teacher = require_role(UserRole.TEACHER)


def student_data(user):
    return dict(id=user.id, login=user.login, status=user.status)


@router.get("/submissions", response_model=SubmissionQueue)
def queue(response: Response, q: str = Query("", max_length=200), task_id: int | None = None,
          review_status: Literal["PENDING", "ACCEPTED", "CHANGES_REQUESTED"] | None = None,
          sort: Literal["newest", "oldest"] = "newest", limit: int = Query(25, ge=1, le=100),
          offset: int = Query(0, ge=0), author: User = Depends(teacher), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    if task_id is not None:
        owned_task(db, task_id, author.id)
    grouped = select(Submission.task_id.label("task_id"), Submission.student_id.label("student_id"),
        func.count().label("count"), func.max(Submission.version).label("version")).join(
            Task, Task.id == Submission.task_id).where(Task.author_id == author.id).group_by(
                Submission.task_id, Submission.student_id).subquery()
    hints = select(SubmissionUsedHint.submission_id.label("submission_id"),
        func.count().label("count")).group_by(SubmissionUsedHint.submission_id).subquery()
    query = select(User, Task, Submission, grouped.c.count,
        func.coalesce(hints.c.count, 0)).select_from(Submission).join(grouped,
        (Submission.task_id == grouped.c.task_id) & (Submission.student_id == grouped.c.student_id) &
        (Submission.version == grouped.c.version)).join(Task, Task.id == Submission.task_id).join(
            User, User.id == Submission.student_id).outerjoin(hints, hints.c.submission_id == Submission.id).outerjoin(
                SubmissionReview, SubmissionReview.submission_id == Submission.id)
    if review_status == "PENDING":
        query = query.where(SubmissionReview.id.is_(None))
    elif review_status:
        query = query.where(SubmissionReview.decision == review_status)
    if task_id is not None:
        query = query.where(Task.id == task_id)
    if q.strip():
        query = query.where(or_(User.login.icontains(q.strip(), autoescape=True),
                                Task.title.icontains(q.strip(), autoescape=True)))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    ordering = (Submission.submitted_at.desc(), Submission.id.desc()) if sort == "newest" else (
        Submission.submitted_at.asc(), Submission.id.asc())
    rows = list(db.execute(query.options(load_only(User.id, User.login, User.status),
        load_only(Task.id, Task.title, Task.topic), load_only(Submission.id, Submission.version,
            Submission.summary, Submission.submitted_at)).order_by(*ordering).limit(limit).offset(offset)))
    reviews = review_map(db, [row[2].id for row in rows])
    tasks = db.execute(select(Task.id, Task.title, Task.topic).where(Task.author_id == author.id).order_by(Task.title, Task.id))
    return dict(items=[dict(student=student_data(user), task=dict(id=task.id, title=task.title, topic=task.topic),
        submission_count=count, used_hint_count=hint_count, latest_submission=public_submission(submission, reviews.get(submission.id)))
        for user, task, submission, count, hint_count in rows], total=total, limit=limit, offset=offset,
        tasks=[dict(id=t.id, title=t.title, topic=t.topic) for t in tasks])


@router.get("/tasks/{task_id}/submissions", response_model=SubmissionPage)
def students(task_id: int, response: Response, limit: int = Query(25, ge=1, le=100),
             offset: int = Query(0, ge=0), author: User = Depends(teacher), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    owned_task(db, task_id, author.id)
    grouped = select(Submission.student_id.label("student_id"),
        func.count().label("count"), func.max(Submission.version).label("version")).where(
            Submission.task_id == task_id).group_by(Submission.student_id).subquery()
    total = db.scalar(select(func.count()).select_from(grouped))
    rows = list(db.execute(select(User, Submission, grouped.c.count).join(
        grouped, grouped.c.student_id == User.id).join(Submission,
        (Submission.student_id == User.id) & (Submission.task_id == task_id) &
        (Submission.version == grouped.c.version)).order_by(
            Submission.submitted_at.desc(), Submission.id.desc()).options(load_only(
                Submission.id, Submission.version, Submission.summary, Submission.submitted_at)).limit(limit).offset(offset)))
    reviews = review_map(db, [row[1].id for row in rows])
    return dict(items=[dict(student=student_data(user), submission_count=count,
        latest_submission=public_submission(submission, reviews.get(submission.id))) for user, submission, count in rows],
        total=total, limit=limit, offset=offset)


@router.get("/tasks/{task_id}/students/{student_id}/submissions", response_model=SubmissionHistory)
def history(task_id: int, student_id: int, response: Response,
            author: User = Depends(teacher), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    owned_task(db, task_id, author.id)
    rows = list(db.scalars(select(Submission).where(Submission.task_id == task_id,
        Submission.student_id == student_id).options(load_only(Submission.id, Submission.version,
            Submission.summary, Submission.submitted_at)).order_by(Submission.version.desc())))
    # Do not expose unrelated accounts through a guessed student ID.
    user = db.get(User, student_id) if rows else None
    reviews = review_map(db, [row.id for row in rows])
    return dict(student=student_data(user) if user else None,
                items=[public_submission(row, reviews.get(row.id)) for row in rows])


@router.get("/submissions/{submission_id}", response_model=SubmissionDetail)
def detail(submission_id: int, response: Response,
           author: User = Depends(teacher), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    row = db.scalar(select(Submission).join(Task, Task.id == Submission.task_id).where(
        Submission.id == submission_id, Task.author_id == author.id))
    if row is None:
        raise HTTPException(404, "Submission not found")
    results = db.scalars(select(SolutionTestResult).where(
        SolutionTestResult.submission_id == row.id).order_by(SolutionTestResult.number))
    snapshots = []
    for test in results:
        definition = {k: v for k, v in test.definition.items() if k != "teacher_result"}
        result = test.definition.get("teacher_result", test.student_result)
        snapshots.append(dict(number=test.number, definition=definition, result=result,
                              execution_details_available=result.get("details") is not None))
    hints = db.scalars(select(SubmissionUsedHint).where(
        SubmissionUsedHint.submission_id == row.id).order_by(SubmissionUsedHint.reveal_order))
    total_hints = row.summary.get("total_hints")
    if total_hints is None:
        total_hints = db.scalar(select(func.count()).select_from(TaskHint).where(TaskHint.task_id == row.task_id))
    reviews = review_map(db, [row.id])
    return dict(**public_submission(row, reviews.get(row.id)), task_id=row.task_id, total_hints=total_hints,
        student=student_data(db.get(User, row.student_id)), source_code=row.source_code,
        test_results=snapshots, used_hints=[dict(hint_id=h.hint_id,
            reveal_order=h.reveal_order, revealed_at=h.revealed_at) for h in hints])
