"""Current work and immutable formal snapshots (KAN-37)."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, Text, String, UniqueConstraint, CheckConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class SolutionDraft(Base):
    __tablename__ = "solution_drafts"
    __table_args__ = (UniqueConstraint("student_id", "task_id", name="uq_draft_student_task"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="RESTRICT"), index=True)
    source_code: Mapped[str] = mapped_column(Text)
    revision: Mapped[int] = mapped_column(default=0, server_default="0")
    check_count: Mapped[int] = mapped_column(default=0, server_default="0")
    next_version: Mapped[int] = mapped_column(default=1, server_default="1")
    checked_hash: Mapped[str | None] = mapped_column(String(64))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    check_summary: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DraftUsedHint(Base):
    __tablename__ = "draft_used_hints"
    __table_args__ = (UniqueConstraint("draft_id", "hint_id", name="uq_draft_hint"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("solution_drafts.id", ondelete="CASCADE"), index=True)
    hint_id: Mapped[int] = mapped_column(ForeignKey("task_hints.id", ondelete="CASCADE"), index=True)
    revealed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (UniqueConstraint("student_id", "task_id", "version", name="uq_submission_version"),
                      CheckConstraint("version > 0", name="ck_submission_version"))
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="RESTRICT"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    source_code: Mapped[str] = mapped_column(Text)
    summary: Mapped[dict] = mapped_column(JSONB)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SubmissionUsedHint(Base):
    __tablename__ = "submission_used_hints"
    __table_args__ = (UniqueConstraint("submission_id", "hint_id", name="uq_submission_hint"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id", ondelete="RESTRICT"), index=True)
    # Historical identity survives deletion/reordering of the live hint; no content copied.
    hint_id: Mapped[int] = mapped_column(Integer)
    reveal_order: Mapped[int] = mapped_column(Integer)
    revealed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SolutionTestResult(Base):
    __tablename__ = "solution_test_results"
    __table_args__ = (CheckConstraint("(draft_id IS NULL) <> (submission_id IS NULL)", name="ck_result_owner"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    draft_id: Mapped[int | None] = mapped_column(ForeignKey("solution_drafts.id", ondelete="CASCADE"), index=True)
    submission_id: Mapped[int | None] = mapped_column(ForeignKey("submissions.id", ondelete="RESTRICT"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    # Deliberately no live test FK: historical definitions must survive teacher edits/deletes.
    definition: Mapped[dict] = mapped_column(JSONB)
    student_result: Mapped[dict] = mapped_column(JSONB)
