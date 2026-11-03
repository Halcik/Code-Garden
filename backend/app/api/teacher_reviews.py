from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from app.api.dependencies import check_origin, require_role
from app.db.session import get_db
from app.models.review import SubmissionReview, TeacherStudentNote
from app.models.solution import Submission
from app.models.task import Task
from app.models.user import User, UserRole
from app.schemas.review import ReviewWrite, ReviewResponse, NoteWrite, NoteResponse
from app.services.reviews import public_review

router = APIRouter(prefix="/teacher", tags=["teacher review"])
teacher = require_role(UserRole.TEACHER)


@router.put("/submissions/{submission_id}/review", response_model=ReviewResponse, dependencies=[Depends(check_origin)])
def save_review(submission_id: int, payload: ReviewWrite, response: Response,
                author: User = Depends(teacher), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    row = db.scalar(select(Submission.id).join(Task, Task.id == Submission.task_id).where(
        Submission.id == submission_id, Task.author_id == author.id))
    if row is None:
        raise HTTPException(404, "Submission not found")
    now = datetime.now(timezone.utc)
    values = dict(decision=payload.decision, feedback=payload.feedback, reviewed_by=author.id,
                  reviewed_at=now, updated_at=now)
    statement = insert(SubmissionReview).values(submission_id=row, **values).on_conflict_do_update(
        constraint="uq_review_submission", set_=values).returning(SubmissionReview)
    review = db.scalar(statement.execution_options(populate_existing=True))
    db.commit()
    return public_review(review)


def accessible_student(db, teacher_id, student_id):
    # Existing policy: a teacher may work with pupils who submitted to their tasks.
    found = db.scalar(select(Submission.id).join(Task, Task.id == Submission.task_id).join(
        User, User.id == Submission.student_id).where(Task.author_id == teacher_id,
        Submission.student_id == student_id, User.role == UserRole.STUDENT).limit(1))
    if found is None:
        raise HTTPException(404, "Student not found")


@router.get("/students/{student_id}/note", response_model=NoteResponse)
def get_note(student_id: int, response: Response, author: User = Depends(teacher), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    accessible_student(db, author.id, student_id)
    note = db.scalar(select(TeacherStudentNote).where(TeacherStudentNote.teacher_id == author.id,
                                                    TeacherStudentNote.student_id == student_id))
    return dict(student_id=student_id, content=note.content if note else "", updated_at=note.updated_at if note else None)


@router.put("/students/{student_id}/note", response_model=NoteResponse, dependencies=[Depends(check_origin)])
def save_note(student_id: int, payload: NoteWrite, response: Response,
              author: User = Depends(teacher), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    accessible_student(db, author.id, student_id)
    values = dict(content=payload.content, updated_at=datetime.now(timezone.utc))
    statement = insert(TeacherStudentNote).values(teacher_id=author.id, student_id=student_id,
        **values).on_conflict_do_update(constraint="uq_note_teacher_student", set_=values).returning(TeacherStudentNote)
    note = db.scalar(statement.execution_options(populate_existing=True))
    db.commit()
    return dict(student_id=student_id, content=note.content, updated_at=note.updated_at)
