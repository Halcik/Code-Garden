from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

password_hasher = PasswordHash.recommended()
# Dummy hash equalizes password verification for an unknown login.
DUMMY_HASH = password_hasher.hash("dummy-password-never-used-for-login")


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hasher.verify(password, hashed)


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
         "iss": "code-garden", "aud": "code-garden-auth"},
        settings.jwt_secret.get_secret_value(), algorithm="HS256",
    )


def decode_access_token(token: str) -> int:
    claims = jwt.decode(
        token, get_settings().jwt_secret.get_secret_value(), algorithms=["HS256"],
        issuer="code-garden", audience="code-garden-auth", options={"require": ["sub", "iat", "exp", "iss", "aud"]},
    )
    subject = claims["sub"]
    if not isinstance(subject, str) or not subject.isascii() or not subject.isdigit() or int(subject) < 1:
        raise jwt.InvalidTokenError("Invalid subject")
    return int(subject)
