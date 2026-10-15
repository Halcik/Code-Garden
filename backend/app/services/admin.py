from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import AccountStatus, TeacherApproval, User, UserRole
from app.schemas.admin import UserUpdate


def find_user(db: Session, user_id: int, *, lock: bool = False) -> User:
    query = select(User).where(User.id == user_id)
    if lock:
        query = query.with_for_update()
    user = db.scalar(query)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def save_user(db: Session, user: User) -> User:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if getattr(exc.orig, "sqlstate", None) == "23505":
            raise HTTPException(status_code=409, detail="Login or email already exists") from None
        raise
    db.refresh(user)
    return user


def update_user(db: Session, user_id: int, data: UserUpdate) -> User:
    user = find_user(db, user_id, lock=True)
    changes = data.model_dump(exclude_unset=True)
    if user.role == UserRole.TEACHER and "email" in changes and changes["email"] is None:
        raise HTTPException(status_code=422, detail="Teacher email is required")
    for field, value in changes.items():
        setattr(user, field, value)
    return save_user(db, user)


def set_account_status(db: Session, user_id: int, status: AccountStatus, actor: User) -> User:
    if user_id == actor.id and status == AccountStatus.INACTIVE:
        raise HTTPException(status_code=409, detail="Cannot deactivate your own account")
    user = find_user(db, user_id, lock=True)
    user.status = status
    # Approval is independent: activating a pending/rejected teacher never approves them.
    return save_user(db, user)


def set_teacher_approval(db: Session, user_id: int, approval: TeacherApproval) -> User:
    user = find_user(db, user_id, lock=True)
    if user.role != UserRole.TEACHER:
        raise HTTPException(status_code=409, detail="User is not a teacher")
    user.teacher_approval = approval
    # Approval does not reactivate an account explicitly disabled by an administrator.
    return save_user(db, user)
