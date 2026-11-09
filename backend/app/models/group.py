from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Table, Text, func, select
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.db.base import Base
from app.models.group_invitation import GroupInvitation

if TYPE_CHECKING:
    from app.models.user import User


group_students = Table(
    "group_students", Base.metadata,
    Column("group_id", ForeignKey("student_groups.id", ondelete="CASCADE"), primary_key=True),
    Column("student_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class StudentGroup(Base):
    __tablename__ = "student_groups"
    __table_args__ = (CheckConstraint("length(trim(name)) > 0", name="ck_student_groups_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_count: Mapped[int] = column_property(
        select(func.count()).where(group_students.c.group_id == id)
        .correlate_except(group_students).scalar_subquery()
    )
    pending_invitation_count: Mapped[int] = column_property(
        select(func.count()).where(GroupInvitation.group_id == id, GroupInvitation.status == "PENDING")
        .correlate_except(GroupInvitation).scalar_subquery()
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    age_range: Mapped[str | None] = mapped_column(String(50), nullable=True)
    achievements_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    study_streak_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    teacher: Mapped["User"] = relationship(back_populates="owned_groups")
    students: Mapped[list["User"]] = relationship(
        secondary=group_students, back_populates="student_groups", passive_deletes=True,
    )
