from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TaskAssignment(Base):
    __tablename__ = "task_assignments"
    __table_args__ = (
        UniqueConstraint("task_id", "student_id", "assigned_by_teacher_id", "source_group_id",
                         name="uq_task_assignments_source", postgresql_nulls_not_distinct=True),
        CheckConstraint("(source_group_id IS NULL AND group_id IS NULL) OR "
                        "(source_group_id IS NOT NULL AND source_group_id > 0 AND (group_id IS NULL OR group_id = source_group_id))",
                        name="ck_task_assignments_source_group"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_by_teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    group_id: Mapped[int | None] = mapped_column(ForeignKey("student_groups.id", ondelete="SET NULL"), nullable=True, index=True)
    # Durable source identity, deliberately not an FK: deleting a group must not
    # merge its source with a direct assignment or another deleted group.
    source_group_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
