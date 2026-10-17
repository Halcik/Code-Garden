import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User


class TaskDifficulty(str, enum.Enum):
    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"


class TaskType(str, enum.Enum):
    STANDARD = "STANDARD"
    FUNCTION = "FUNCTION"
    STRUCTURAL = "STRUCTURAL"


class TaskStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    READY = "READY"


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("estimated_time_minutes > 0", name="ck_tasks_positive_time"),
        CheckConstraint("length(trim(title)) > 0", name="ck_tasks_title"),
        CheckConstraint("length(trim(topic)) > 0", name="ck_tasks_topic"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    theory: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    starter_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    topic: Mapped[str] = mapped_column(String(100), nullable=False)
    difficulty: Mapped[TaskDifficulty] = mapped_column(Enum(TaskDifficulty, name="task_difficulty"), nullable=False)
    task_type: Mapped[TaskType] = mapped_column(Enum(TaskType, name="task_type"), nullable=False)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus, name="task_status"), nullable=False,
                                              default=TaskStatus.DRAFT, server_default="DRAFT")
    estimated_time_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    author: Mapped[User] = relationship(back_populates="tasks")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                               onupdate=func.now(), nullable=False)
