from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.dependencies import check_origin, require_role
from app.db.session import get_db
from app.models.user import AccountStatus, TeacherApproval, User, UserRole
from app.schemas.admin import UserList, UserUpdate
from app.schemas.auth import UserResponse
from app.services.admin import find_user, set_account_status, set_teacher_approval, update_user


def no_store(response: Response):
    response.headers["Cache-Control"] = "no-store"


admin_user = require_role(UserRole.ADMIN)
router = APIRouter(prefix="/admin/users", tags=["admin users"],
                   dependencies=[Depends(admin_user), Depends(no_store)])


@router.get("", response_model=UserList)
def list_users(role: Optional[UserRole] = None, status: Optional[AccountStatus] = None,
               teacher_approval: Optional[TeacherApproval] = None,
               q: Optional[str] = Query(None, max_length=254),
               limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
               db: Session = Depends(get_db)):
    filters = []
    if q and q.strip():
        term = q.strip()
        filters.append(or_(User.login.icontains(term, autoescape=True),
                           User.email.icontains(term, autoescape=True)))
    if role is not None:
        filters.append(User.role == role)
    if status is not None:
        filters.append(User.status == status)
    if teacher_approval is not None:
        filters.append(User.teacher_approval == teacher_approval)
    total = db.scalar(select(func.count()).select_from(User).where(*filters))
    users = db.scalars(select(User).where(*filters).order_by(User.created_at.desc(), User.id.desc())
                       .limit(limit).offset(offset)).all()
    return {"items": users, "total": total, "limit": limit, "offset": offset}


@router.get("/{user_id}", response_model=UserResponse)
def user_detail(user_id: int, db: Session = Depends(get_db)):
    return find_user(db, user_id)


@router.patch("/{user_id}", response_model=UserResponse, dependencies=[Depends(check_origin)])
def edit_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    return update_user(db, user_id, data)


@router.post("/{user_id}/activate", response_model=UserResponse, dependencies=[Depends(check_origin)])
def activate(user_id: int, actor: User = Depends(admin_user), db: Session = Depends(get_db)):
    return set_account_status(db, user_id, AccountStatus.ACTIVE, actor)


@router.post("/{user_id}/deactivate", response_model=UserResponse, dependencies=[Depends(check_origin)])
def deactivate(user_id: int, actor: User = Depends(admin_user), db: Session = Depends(get_db)):
    return set_account_status(db, user_id, AccountStatus.INACTIVE, actor)


@router.post("/{user_id}/approve-teacher", response_model=UserResponse, dependencies=[Depends(check_origin)])
def approve_teacher(user_id: int, db: Session = Depends(get_db)):
    return set_teacher_approval(db, user_id, TeacherApproval.APPROVED)


@router.post("/{user_id}/reject-teacher", response_model=UserResponse, dependencies=[Depends(check_origin)])
def reject_teacher(user_id: int, db: Session = Depends(get_db)):
    return set_teacher_approval(db, user_id, TeacherApproval.REJECTED)


@router.post("/{user_id}/revoke-teacher", response_model=UserResponse, dependencies=[Depends(check_origin)])
def revoke_teacher(user_id: int, db: Session = Depends(get_db)):
    return set_teacher_approval(db, user_id, TeacherApproval.PENDING)
