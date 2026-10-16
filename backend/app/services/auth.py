from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import DUMMY_HASH, hash_password, verify_password
from app.models.user import AccountStatus, TeacherApproval, User, UserRole
from app.schemas.auth import RegisterRequest


def register_user(db: Session, data: RegisterRequest) -> User:
    user = User(login=data.login, email=str(data.email) if data.email else None,
                role=data.role, password_hash=hash_password(data.password),
                status=AccountStatus.ACTIVE,
                teacher_approval=TeacherApproval.PENDING if data.role == UserRole.TEACHER else None)
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if getattr(exc.orig, "sqlstate", None) == "23505":
            raise HTTPException(status_code=409, detail="Login or email already exists") from None
        raise
    db.refresh(user)
    return user


def authenticate_user(db: Session, login: str, password: str) -> User:
    user = db.scalar(select(User).where(User.login == login))
    valid = verify_password(password, user.password_hash if user else DUMMY_HASH)
    if user is None or not valid:
        raise HTTPException(status_code=401, detail="Invalid login or password")
    return user
