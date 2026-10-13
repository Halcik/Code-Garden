from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import check_origin, get_current_user
from app.core.config import get_settings
from app.core.rate_limit import check_auth_ip, check_login_attempt
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, UserResponse
from app.services.auth import authenticate_user, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(check_origin), Depends(check_auth_ip)])
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    return register_user(db, data)


@router.post("/login", response_model=UserResponse,
             dependencies=[Depends(check_origin), Depends(check_auth_ip)])
def login(data: LoginRequest, response: Response, db: Session = Depends(get_db)):
    check_login_attempt(data.login)
    user = authenticate_user(db, data.login, data.password)
    settings = get_settings()
    response.set_cookie(key=settings.cookie_name, value=create_access_token(user.id),
                        httponly=True, secure=settings.cookie_secure, samesite="lax",
                        max_age=settings.jwt_expire_minutes * 60, path="/")
    response.headers["Cache-Control"] = "no-store"
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(check_origin)])
def logout():
    settings = get_settings()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(key=settings.cookie_name, path="/", httponly=True,
                           secure=settings.cookie_secure, samesite="lax")
    return response


@router.get("/me", response_model=UserResponse)
def me(response: Response, user: User = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-store"
    return user
