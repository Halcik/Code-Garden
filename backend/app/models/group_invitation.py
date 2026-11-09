from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class GroupInvitation(Base):
    __tablename__ = "group_invitations"
    __table_args__ = (
        CheckConstraint("status IN ('PENDING', 'ACCEPTED', 'REJECTED')", name="ck_group_invitations_status"),
        Index("uq_group_invitations_pending", "group_id", "student_id", unique=True,
              postgresql_where=text("status = 'PENDING'")),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("student_groups.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    invited_by_teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(16), default="PENDING", server_default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GroupInvitationCode(Base):
    __tablename__ = "group_invitation_codes"
    __table_args__ = (CheckConstraint("expires_at > created_at", name="ck_group_invitation_codes_expiry"),)
    group_id: Mapped[int] = mapped_column(ForeignKey("student_groups.id", ondelete="CASCADE"), primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
