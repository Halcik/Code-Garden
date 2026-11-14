"""Append-only decisions for successive publication rounds."""
from datetime import datetime
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class PublicationReview(Base):
    __tablename__ = "publication_reviews"
    __table_args__ = (
        UniqueConstraint("task_id", "publication_round", "stage", name="uq_publication_review_stage"),
        CheckConstraint("stage IN ('TEACHER', 'ADMIN')", name="ck_publication_stage"),
        CheckConstraint("decision IN ('ACCEPTED', 'CHANGES_REQUESTED')", name="ck_publication_decision"),
        CheckConstraint("decision != 'CHANGES_REQUESTED' OR length(trim(comment)) > 0", name="ck_publication_comment"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="RESTRICT"), index=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    publication_round: Mapped[int] = mapped_column(Integer)
    stage: Mapped[str] = mapped_column(String(16))
    decision: Mapped[str] = mapped_column(String(32))
    comment: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
