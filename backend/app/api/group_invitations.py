from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import check_origin, require_role
from app.core.rate_limit import auth_limiter
from app.db.session import get_db
from app.models.group import StudentGroup, group_students
from app.models.group_invitation import GroupInvitation, GroupInvitationCode
from app.models.user import AccountStatus, User, UserRole
from app.schemas.group_invitation import (GenerateCode, InvitationCodeResponse, InvitationResponse,
    InviteStudent, JoinByCode, StudentGroupResponse, StudentIdentity)
from app.services import groups


def no_store(response: Response):
    response.headers["Cache-Control"] = "no-store"


teacher_router = APIRouter(prefix="/teacher/groups", tags=["teacher invitations"], dependencies=[Depends(no_store)])
student_router = APIRouter(prefix="/student", tags=["student groups"], dependencies=[Depends(no_store)])
teacher_guard = require_role(UserRole.TEACHER)
student_guard = require_role(UserRole.STUDENT)


@teacher_router.get("/{group_id}/students/search", response_model=list[StudentIdentity])
def search_students(group_id: int, q: str = Query(min_length=1, max_length=50),
                    teacher: User = Depends(teacher_guard), db: Session = Depends(get_db)):
    groups.owned_group(db, group_id, teacher.id)
    if not q.strip():
        raise HTTPException(422, "Enter a student login")
    auth_limiter.check(("student-search", teacher.id), 100)
    return list(db.scalars(select(User).where(User.role == UserRole.STUDENT, User.status == AccountStatus.ACTIVE,
        User.login.icontains(q.strip(), autoescape=True)).order_by(User.login, User.id).limit(20)))


@teacher_router.get("/{group_id}/members", response_model=list[StudentIdentity])
def list_members(group_id: int, teacher: User = Depends(teacher_guard), db: Session = Depends(get_db)):
    groups.owned_group(db, group_id, teacher.id)
    return list(db.scalars(select(User).join(group_students, group_students.c.student_id == User.id)
                          .where(group_students.c.group_id == group_id).order_by(User.login, User.id)))


@teacher_router.delete("/{group_id}/members/{student_id}", status_code=204, dependencies=[Depends(check_origin)])
def remove_member(group_id: int, student_id: int, teacher: User = Depends(teacher_guard), db: Session = Depends(get_db)):
    groups.owned_group(db, group_id, teacher.id, lock=True)
    groups.remove_member(db, group_id, student_id)


@teacher_router.post("/{group_id}/invitations", response_model=InvitationResponse, status_code=201, dependencies=[Depends(check_origin)])
def invite_student(group_id: int, payload: InviteStudent, teacher: User = Depends(teacher_guard), db: Session = Depends(get_db)):
    item = groups.invite_student(db, group_id, teacher.id, payload.login)
    return groups.public_invitations(db, GroupInvitation.id == item.id)[0]


@teacher_router.get("/{group_id}/invitations", response_model=list[InvitationResponse])
def list_invitations(group_id: int, teacher: User = Depends(teacher_guard), db: Session = Depends(get_db)):
    groups.owned_group(db, group_id, teacher.id)
    return groups.public_invitations(db, GroupInvitation.group_id == group_id, GroupInvitation.status == "PENDING")


@teacher_router.delete("/{group_id}/invitations/{invitation_id}", status_code=204, dependencies=[Depends(check_origin)])
def cancel_invitation(group_id: int, invitation_id: int, teacher: User = Depends(teacher_guard), db: Session = Depends(get_db)):
    groups.owned_group(db, group_id, teacher.id, lock=True)
    item = db.scalar(select(GroupInvitation).where(GroupInvitation.id == invitation_id, GroupInvitation.group_id == group_id))
    if item is None:
        raise HTTPException(404, "Invitation not found")
    if item.status != "PENDING":
        raise HTTPException(409, "Invitation already answered")
    db.delete(item)
    db.commit()


@teacher_router.get("/{group_id}/invitation-code", response_model=InvitationCodeResponse | None)
def current_code(group_id: int, teacher: User = Depends(teacher_guard), db: Session = Depends(get_db)):
    groups.owned_group(db, group_id, teacher.id)
    return db.get(GroupInvitationCode, group_id)


@teacher_router.post("/{group_id}/invitation-code", response_model=InvitationCodeResponse, dependencies=[Depends(check_origin)])
def generate_code(group_id: int, payload: GenerateCode, teacher: User = Depends(teacher_guard), db: Session = Depends(get_db)):
    return groups.generate_code(db, group_id, teacher.id, payload.hours)


@student_router.get("/groups", response_model=list[StudentGroupResponse])
def student_groups(student: User = Depends(student_guard), db: Session = Depends(get_db)):
    items = db.scalars(select(StudentGroup).join(group_students, group_students.c.group_id == StudentGroup.id)
        .where(group_students.c.student_id == student.id).options(joinedload(StudentGroup.teacher))
        .order_by(StudentGroup.created_at.desc(), StudentGroup.id.desc()))
    return groups.public_student_groups(db, student.id, items)


@student_router.post("/groups/join", response_model=StudentGroupResponse, dependencies=[Depends(check_origin)])
def join_group(payload: JoinByCode, student: User = Depends(student_guard), db: Session = Depends(get_db)):
    auth_limiter.check(("group-code", student.id), 30)
    group_id = groups.join_by_code(db, student.id, payload.code)
    return groups.public_student_groups(db, student.id, [groups.find_group(db, group_id)])[0]


@student_router.get("/groups/{group_id}", response_model=StudentGroupResponse)
def get_student_group(group_id: int, student: User = Depends(student_guard), db: Session = Depends(get_db)):
    if not groups.is_member(db, group_id, student.id):
        raise HTTPException(404, "Group not found")
    return groups.public_student_groups(db, student.id, [groups.find_group(db, group_id)])[0]


@student_router.delete("/groups/{group_id}/membership", status_code=204, dependencies=[Depends(check_origin)])
def leave_group(group_id: int, student: User = Depends(student_guard), db: Session = Depends(get_db)):
    groups.find_group(db, group_id, lock=True)
    groups.remove_member(db, group_id, student.id)


@student_router.get("/group-invitations", response_model=list[InvitationResponse])
def student_invitations(student: User = Depends(student_guard), db: Session = Depends(get_db)):
    return groups.public_invitations(db, GroupInvitation.student_id == student.id, GroupInvitation.status == "PENDING")


@student_router.post("/group-invitations/{invitation_id}/accept", status_code=204, dependencies=[Depends(check_origin)])
def accept_invitation(invitation_id: int, student: User = Depends(student_guard), db: Session = Depends(get_db)):
    groups.respond_to_invitation(db, invitation_id, student.id, True)


@student_router.post("/group-invitations/{invitation_id}/reject", status_code=204, dependencies=[Depends(check_origin)])
def reject_invitation(invitation_id: int, student: User = Depends(student_guard), db: Session = Depends(get_db)):
    groups.respond_to_invitation(db, invitation_id, student.id, False)
