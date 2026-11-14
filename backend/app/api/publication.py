from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.api.dependencies import check_origin, require_active_user, require_role
from app.api.teacher import owned_task
from app.db.session import get_db
from app.models.publication import PublicationReview
from app.models.task import Task, TaskDifficulty, TaskStatus
from app.models.user import User, UserRole
from app.schemas.task import TaskResponse
from app.schemas.task_hint import TaskHintResponse
from app.schemas.task_test import TaskTestResponse
from app.services.task_catalog import task_filters

router = APIRouter(tags=["task publication"])
teacher = require_role(UserRole.TEACHER)
admin = require_role(UserRole.ADMIN)


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    publication_round: int = Field(ge=1)
    decision: Literal["ACCEPTED", "CHANGES_REQUESTED"]
    comment: str = Field(default="", max_length=5000)

    @model_validator(mode="after")
    def comment_required(self):
        if self.decision == "CHANGES_REQUESTED" and not self.comment:
            raise ValueError("A comment is required when requesting changes")
        return self


@router.post("/teacher/tasks/{task_id}/publication", response_model=TaskResponse,
             dependencies=[Depends(check_origin)])
def submit(task_id: int, response: Response, user: User = Depends(teacher), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    task = owned_task(db, task_id, user.id, lock=True)
    if task.is_archived or task.status not in (TaskStatus.READY, TaskStatus.CHANGES_REQUESTED_BY_TEACHER,
                                               TaskStatus.CHANGES_REQUESTED_BY_ADMIN):
        raise HTTPException(409, "Task cannot be submitted for publication")
    if not (task.instructions or "").strip():
        raise HTTPException(422, "Ready tasks require instructions")
    task.status = TaskStatus.PENDING_TEACHER_REVIEW
    task.publication_round += 1
    task.publication_submitted_at = datetime.now(timezone.utc)
    db.commit()
    return task


@router.post("/teacher/tasks/{task_id}/withdraw-publication", response_model=TaskResponse,
             dependencies=[Depends(check_origin)])
def withdraw(task_id: int, response: Response, user: User = Depends(teacher), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    task = owned_task(db, task_id, user.id, lock=True)
    if task.is_archived or task.status != TaskStatus.PUBLISHED:
        raise HTTPException(409, "Only a published active task can be withdrawn for editing")
    task.status = TaskStatus.READY
    db.commit()
    return task


def stage_status(user):
    return TaskStatus.PENDING_ADMIN_REVIEW if user.role == UserRole.ADMIN else TaskStatus.PENDING_TEACHER_REVIEW


@router.get("/teacher/publication-reviews", dependencies=[Depends(teacher)])
@router.get("/admin/publication-reviews", dependencies=[Depends(admin)])
def queue(response: Response, q: str = Query("", max_length=200), topic: str = Query("", max_length=100),
          difficulty: TaskDifficulty | None = None, sort: Literal["newest", "oldest"] = "newest",
          limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
          user: User = Depends(require_role(UserRole.TEACHER, UserRole.ADMIN)), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    filters = [Task.is_archived.is_(False), Task.status == stage_status(user), Task.author_id != user.id,
               *task_filters(search=q, topic=topic, difficulty=difficulty)]
    total = db.scalar(select(func.count()).select_from(Task).where(*filters))
    counts = dict(db.execute(select(Task.status, func.count()).where(Task.is_archived.is_(False),
        Task.author_id != user.id).group_by(Task.status)).all())
    ordering = Task.publication_submitted_at.desc() if sort == "newest" else Task.publication_submitted_at.asc()
    rows = db.execute(select(Task, User.login).join(User, User.id == Task.author_id).where(*filters)
                      .order_by(ordering, Task.id).limit(limit).offset(offset)).all()
    return dict(items=[dict(**TaskResponse.model_validate(t).model_dump(), author_login=login) for t, login in rows],
                total=total, limit=limit, offset=offset, metrics={s.value: counts.get(s, 0) for s in TaskStatus})


@router.get("/publication/tasks/{task_id}")
def detail(task_id: int, response: Response, user: User = Depends(require_active_user), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    task = db.get(Task, task_id)
    if task is None or user.role not in (UserRole.TEACHER, UserRole.ADMIN):
        raise HTTPException(404, "Task not found")
    is_author = task.author_id == user.id
    is_stage_reviewer = not task.is_archived and task.status == stage_status(user)
    is_public = not task.is_archived and task.status == TaskStatus.PUBLISHED
    if not (is_author or is_stage_reviewer or is_public):
        raise HTTPException(404, "Task not found")
    # Public task content does not grant access to internal reviewer identities,
    # rounds or comments. Do not even fetch these for a catalogue-only reader.
    history = []
    if is_author or is_stage_reviewer:
        history = db.execute(select(PublicationReview, User.login).join(User, User.id == PublicationReview.reviewer_id)
            .where(PublicationReview.task_id == task_id).order_by(PublicationReview.id)).all()
    return dict(task=TaskResponse.model_validate(task), author_login=task.author.login,
        tests=[TaskTestResponse.model_validate(t) for t in task.tests],
        hints=[TaskHintResponse.model_validate(h) for h in task.hints],
        history=[dict(id=r.id, reviewer_id=r.reviewer_id, reviewer_login=login, stage=r.stage,
            publication_round=r.publication_round, decision=r.decision, comment=r.comment, created_at=r.created_at)
                 for r, login in history])


def decide(db, task_id, payload, user, stage):
    task = db.scalar(select(Task).where(Task.id == task_id).with_for_update())
    expected = TaskStatus.PENDING_TEACHER_REVIEW if stage == "TEACHER" else TaskStatus.PENDING_ADMIN_REVIEW
    if task is None:
        raise HTTPException(404, "Task not found")
    if task.author_id == user.id:
        raise HTTPException(403, "Authors cannot review their own tasks")
    if task.is_archived or task.status != expected or task.publication_round != payload.publication_round:
        raise HTTPException(409, "Publication stage changed. Refresh the queue.")
    if payload.decision == "ACCEPTED":
        task.status = TaskStatus.PENDING_ADMIN_REVIEW if stage == "TEACHER" else TaskStatus.PUBLISHED
    else:
        task.status = TaskStatus.CHANGES_REQUESTED_BY_TEACHER if stage == "TEACHER" else TaskStatus.CHANGES_REQUESTED_BY_ADMIN
    db.add(PublicationReview(task_id=task.id, reviewer_id=user.id, stage=stage,
        publication_round=task.publication_round, decision=payload.decision, comment=payload.comment))
    db.commit()
    return task


@router.post("/teacher/publication-reviews/{task_id}", response_model=TaskResponse, dependencies=[Depends(check_origin)])
def teacher_decision(task_id: int, payload: Decision, response: Response, user: User = Depends(teacher), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return decide(db, task_id, payload, user, "TEACHER")


@router.post("/admin/publication-reviews/{task_id}", response_model=TaskResponse, dependencies=[Depends(check_origin)])
def admin_decision(task_id: int, payload: Decision, response: Response, user: User = Depends(admin), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return decide(db, task_id, payload, user, "ADMIN")
