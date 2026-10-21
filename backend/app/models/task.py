import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
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
        CheckConstraint("time_limit_seconds > 0 AND time_limit_seconds <= 15", name="ck_tasks_cpu_limit"),
        CheckConstraint("memory_limit_mb > 0 AND memory_limit_mb <= 512", name="ck_tasks_memory_limit"),
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
    python_version: Mapped[str] = mapped_column(String(20), nullable=False, default="3.13", server_default="3.13")
    time_limit_seconds: Mapped[float] = mapped_column(Float, nullable=False, default=2, server_default="2")
    memory_limit_mb: Mapped[int] = mapped_column(Integer, nullable=False, default=256, server_default="256")
    topic: Mapped[str] = mapped_column(String(100), nullable=False)
    difficulty: Mapped[TaskDifficulty] = mapped_column(Enum(TaskDifficulty, name="task_difficulty"), nullable=False)
    task_type: Mapped[TaskType] = mapped_column(Enum(TaskType, name="task_type"), nullable=False)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus, name="task_status"), nullable=False,
                                              default=TaskStatus.DRAFT, server_default="DRAFT")
    estimated_time_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    tests: Mapped[list["TaskTest"]] = relationship(back_populates="task", cascade="all, delete-orphan", order_by="TaskTest.position")
    hints: Mapped[list["TaskHint"]] = relationship(back_populates="task", cascade="all, delete-orphan", order_by="TaskHint.position")
    author: Mapped[User] = relationship(back_populates="tasks")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                               onupdate=func.now(), nullable=False)


class TaskTest(Base):
    __tablename__ = "task_tests"
    __table_args__ = (
        CheckConstraint("position > 0", name="ck_task_tests_position"),
        CheckConstraint("length(trim(name)) > 0", name="ck_task_tests_name"),
        CheckConstraint("test_type IN ('INPUT_OUTPUT', 'FUNCTION', 'STRUCTURAL')", name="ck_task_tests_type"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    test_type: Mapped[str] = mapped_column(String(20))
    config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    position: Mapped[int] = mapped_column(Integer)
    task: Mapped[Task] = relationship(back_populates="tests")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TaskHint(Base):
    __tablename__ = "task_hints"
    __table_args__ = (
        CheckConstraint("position > 0", name="ck_task_hints_position"),
        CheckConstraint("length(trim(title)) > 0", name="ck_task_hints_title"),
        CheckConstraint("length(trim(content)) > 0", name="ck_task_hints_content"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer)
    task: Mapped[Task] = relationship(back_populates="hints")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
