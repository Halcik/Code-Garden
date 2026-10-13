import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User


def check_origin(request: Request):
    origin = request.headers.get("origin")
    if origin is not None and origin not in get_settings().cors_origins:
        raise HTTPException(status_code=403, detail="Origin is not allowed")
    if origin is None and request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(status_code=403, detail="Cross-site request is not allowed")


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(get_settings().cookie_name)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        user_id = decode_access_token(token)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from None
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
