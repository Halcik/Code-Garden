import enum
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Enum, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.task import Task

from app.db.base import Base


class UserRole(str, enum.Enum):
    STUDENT = "STUDENT"
    TEACHER = "TEACHER"
    ADMIN = "ADMIN"


class AccountStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class TeacherApproval(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class User(Base):
    __tablename__ = "users"
    tasks: Mapped[list["Task"]] = relationship(back_populates="author", passive_deletes="all")
    __table_args__ = (
        UniqueConstraint("login", name="uq_users_login"),
        UniqueConstraint("email", name="uq_users_email"),
        CheckConstraint("role != 'TEACHER' OR email IS NOT NULL", name="ck_users_teacher_email"),
        CheckConstraint(
            "(role = 'TEACHER' AND teacher_approval IS NOT NULL) OR "
            "(role != 'TEACHER' AND teacher_approval IS NULL)",
            name="ck_users_teacher_approval",
        ),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    login: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(254), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)
    status: Mapped[AccountStatus] = mapped_column(
        Enum(AccountStatus, name="account_status"), nullable=False,
        default=AccountStatus.ACTIVE, server_default=AccountStatus.ACTIVE.value,
    )
    teacher_approval: Mapped[Optional[TeacherApproval]] = mapped_column(
        Enum(TeacherApproval, name="teacher_approval"), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
