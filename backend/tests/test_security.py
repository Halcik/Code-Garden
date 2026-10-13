from datetime import datetime, timedelta, timezone

import jwt
import pytest
from pydantic import ValidationError

from app.core.config import get_settings
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.schemas.auth import RegisterRequest


def test_hash_and_token():
    hashed = hash_password("ExamplePassword123!")
    assert hashed.startswith("$argon2id$")
    assert verify_password("ExamplePassword123!", hashed)
    assert not verify_password("WrongPassword123!", hashed)
    assert decode_access_token(create_access_token(42)) == 42


def test_expired_and_tampered_token():
    token = create_access_token(42)
    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(token + "tampered")
    expired = jwt.encode({"sub": "42", "iat": datetime.now(timezone.utc) - timedelta(hours=1),
                          "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
                          "iss": "code-garden", "aud": "code-garden-auth"},
                         get_settings().jwt_secret.get_secret_value(), algorithm="HS256")
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(expired)


@pytest.mark.parametrize("extra", [{"role": "ADMIN"}, {"role": "TEACHER"},
                                    {"email": "invalid"}, {"password": "short"},
                                    {"password_hash": "injected"}])
def test_reject_invalid_registration(extra):
    with pytest.raises(ValidationError):
        RegisterRequest(**{"login": "student", "password": "ExamplePassword123!", **extra})


def test_normalization_and_teacher():
    data = RegisterRequest(login=" Student ", password="ExamplePassword123!")
    assert data.login == "student" and data.email is None
    teacher = RegisterRequest(login="teacher", email=" Teacher@Example.com ",
                              password="ExamplePassword123!", role="TEACHER")
    assert teacher.email == "teacher@example.com"
