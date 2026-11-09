from datetime import datetime, timedelta, timezone
import secrets

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.group import StudentGroup, group_students
from app.models.group_invitation import GroupInvitation, GroupInvitationCode
from app.models.user import AccountStatus, User, UserRole
from app.models.task import Task, TaskStatus
from app.models.task_assignment import TaskAssignment


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def owned_group(db: Session, group_id: int, teacher_id: int, lock: bool = False) -> StudentGroup:
    return find_group(db, group_id, teacher_id=teacher_id, lock=lock)


def find_group(db: Session, group_id: int, *, teacher_id: int | None = None, lock: bool = False) -> StudentGroup:
    query = select(StudentGroup).where(StudentGroup.id == group_id)
    if teacher_id is not None:
        query = query.where(StudentGroup.teacher_id == teacher_id)
    group = db.scalar(query.with_for_update() if lock else query)
    if group is None:
        raise HTTPException(404, "Group not found")
    return group


def is_member(db: Session, group_id: int, student_id: int) -> bool:
    return db.scalar(select(group_students.c.student_id).where(
        group_students.c.group_id == group_id, group_students.c.student_id == student_id)) is not None


def add_member(db: Session, group_id: int, student_id: int):
    # The group lock serializes membership/invitation mutations; the composite PK
    # and ON CONFLICT also protect against duplicate membership at database level.
    inserted = db.scalar(insert(group_students).values(group_id=group_id, student_id=student_id)
                         .on_conflict_do_nothing().returning(group_students.c.student_id))
    if inserted is None:
        raise HTTPException(409, "Student already belongs to this group")


def invite_student(db: Session, group_id: int, teacher_id: int, login: str):
    owned_group(db, group_id, teacher_id, lock=True)
    student = db.scalar(select(User).where(User.login == login, User.role == UserRole.STUDENT,
                                          User.status == AccountStatus.ACTIVE))
    if student is None:
        raise HTTPException(404, "Student not found")
    if is_member(db, group_id, student.id):
        raise HTTPException(409, "Student already belongs to this group")
    if db.scalar(select(GroupInvitation.id).where(GroupInvitation.group_id == group_id,
            GroupInvitation.student_id == student.id, GroupInvitation.status == "PENDING")) is not None:
        raise HTTPException(409, "Student already has a pending invitation")
    invitation = GroupInvitation(group_id=group_id, student_id=student.id, invited_by_teacher_id=teacher_id)
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    return invitation


def invitation_rows(db: Session, *filters):
    return db.execute(select(GroupInvitation.id, GroupInvitation.group_id, StudentGroup.name.label("group_name"),
        User.login.label("student_login"), GroupInvitation.student_id, GroupInvitation.invited_by_teacher_id,
        GroupInvitation.status, GroupInvitation.created_at).join(StudentGroup, StudentGroup.id == GroupInvitation.group_id)
        .join(User, User.id == GroupInvitation.student_id).where(*filters)
        .order_by(GroupInvitation.created_at.desc(), GroupInvitation.id.desc())).mappings().all()


def public_invitations(db: Session, *filters):
    rows = invitation_rows(db, *filters)
    teacher_ids = {row["invited_by_teacher_id"] for row in rows}
    teachers = dict(db.execute(select(User.id, User.login).where(User.id.in_(teacher_ids))).all()) if rows else {}
    return [dict(**row, teacher_login=teachers[row["invited_by_teacher_id"]]) for row in rows]


def respond_to_invitation(db: Session, invitation_id: int, student_id: int, accepted: bool):
    # Always lock the parent before the invitation, including when accepting.
    group_id = db.scalar(select(GroupInvitation.group_id).where(
        GroupInvitation.id == invitation_id, GroupInvitation.student_id == student_id))
    if group_id is None:
        raise HTTPException(404, "Invitation not found")
    find_group(db, group_id, lock=True)
    invitation = db.scalar(select(GroupInvitation).where(GroupInvitation.id == invitation_id,
        GroupInvitation.student_id == student_id).with_for_update().execution_options(populate_existing=True))
    if invitation is None:
        raise HTTPException(404, "Invitation not found")
    if invitation.status != "PENDING":
        raise HTTPException(409, "Invitation already answered")
    if accepted:
        add_member(db, group_id, student_id)
    invitation.status = "ACCEPTED" if accepted else "REJECTED"
    db.commit()


def generate_code(db: Session, group_id: int, teacher_id: int, hours: int):
    owned_group(db, group_id, teacher_id, lock=True)
    now = utc_now()
    # 144 random bits, with a UNIQUE constraint; one current code per group.
    code = secrets.token_urlsafe(18)
    db.execute(insert(GroupInvitationCode).values(group_id=group_id, code=code, created_at=now,
        expires_at=now + timedelta(hours=hours)).on_conflict_do_update(index_elements=["group_id"],
        set_={"code": code, "created_at": now, "expires_at": now + timedelta(hours=hours)}))
    db.commit()
    return db.get(GroupInvitationCode, group_id)


def join_by_code(db: Session, student_id: int, code: str):
    group_id = db.scalar(select(GroupInvitationCode.group_id).where(GroupInvitationCode.code == code))
    if group_id is None:
        raise HTTPException(404, "Invalid invitation code")
    find_group(db, group_id, lock=True)
    current = db.scalar(select(GroupInvitationCode).where(GroupInvitationCode.group_id == group_id,
        GroupInvitationCode.code == code).execution_options(populate_existing=True))
    if current is None:
        raise HTTPException(404, "Invalid invitation code")
    if current.expires_at <= utc_now():
        raise HTTPException(410, "Invitation code expired")
    add_member(db, group_id, student_id)
    db.execute(update(GroupInvitation).where(GroupInvitation.group_id == group_id,
        GroupInvitation.student_id == student_id, GroupInvitation.status == "PENDING").values(status="ACCEPTED"))
    db.commit()
    return group_id


def remove_member(db: Session, group_id: int, student_id: int):
    removed = db.scalar(delete(group_students).where(group_students.c.group_id == group_id,
                        group_students.c.student_id == student_id).returning(group_students.c.student_id))
    if removed is None:
        raise HTTPException(404, "Group member not found")
    db.commit()


def public_group(group: StudentGroup):
    return dict(id=group.id, name=group.name, description=group.description, age_range=group.age_range,
                teacher_login=group.teacher.login, student_count=group.student_count, created_at=group.created_at)


def public_student_groups(db: Session, student_id: int, items):
    items = list(items)
    counts = dict(db.execute(select(TaskAssignment.group_id, func.count(TaskAssignment.id))
        .join(Task, Task.id == TaskAssignment.task_id)
        .where(TaskAssignment.student_id == student_id,
               TaskAssignment.group_id.in_([group.id for group in items]),
               Task.status == TaskStatus.READY, Task.is_archived.is_(False))
        .group_by(TaskAssignment.group_id)).all()) if items else {}
    return [dict(**public_group(group), active_task_count=counts.get(group.id, 0)) for group in items]
