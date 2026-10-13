import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, Enum, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserRole(str, enum.Enum):
    STUDENT = "STUDENT"
    TEACHER = "TEACHER"
    ADMIN = "ADMIN"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("login", name="uq_users_login"),
        UniqueConstraint("email", name="uq_users_email"),
        CheckConstraint("role != 'TEACHER' OR email IS NOT NULL", name="ck_users_teacher_email"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    login: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(254), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
