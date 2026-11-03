"""Mutable teacher decisions and private notes, separate from immutable submissions."""
from datetime import datetime
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class SubmissionReview(Base):
    __tablename__ = "submission_reviews"
    __table_args__ = (
        UniqueConstraint("submission_id", name="uq_review_submission"),
        CheckConstraint("decision IN ('ACCEPTED', 'CHANGES_REQUESTED')", name="ck_review_decision"),
        CheckConstraint("decision != 'CHANGES_REQUESTED' OR length(trim(feedback)) > 0", name="ck_review_feedback"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id", ondelete="RESTRICT"))
    decision: Mapped[str] = mapped_column(String(32))
    feedback: Mapped[str] = mapped_column(Text)
    reviewed_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TeacherStudentNote(Base):
    __tablename__ = "teacher_student_notes"
    __table_args__ = (UniqueConstraint("teacher_id", "student_id", name="uq_note_teacher_student"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
