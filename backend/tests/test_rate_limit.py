import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.rate_limit import AuthRateLimiter


def test_limit_and_expiration(monkeypatch):
    now = [100.0]
    monkeypatch.setattr("app.core.rate_limit.monotonic", lambda: now[0])
    limiter = AuthRateLimiter()
    limiter.check("account", 2)
    limiter.check("account", 2)
    with pytest.raises(HTTPException) as error:
        limiter.check("account", 2)
    assert error.value.status_code == 429
    assert error.value.headers == {"Retry-After": "60"}
    limiter.check("other-account", 2)
    now[0] += 60
    limiter.check("account", 2)
    assert "other-account" not in limiter.events


def test_capacity_does_not_evict_active_limits(monkeypatch):
    monkeypatch.setattr("app.core.rate_limit.monotonic", lambda: 100.0)
    limiter = AuthRateLimiter(max_keys=1)
    limiter.check("account", 1)
    with pytest.raises(HTTPException):
        limiter.check("other-account", 1)
    with pytest.raises(HTTPException):
        limiter.check("account", 1)


def test_routes_limit_before_password_work(monkeypatch):
    from app.core import rate_limit
    from app.api import auth
    from app.db.session import get_db
    from app.main import app

    monkeypatch.setattr(rate_limit, "auth_limiter", AuthRateLimiter())
    calls = []

    def reject_login(*args):
        calls.append(args)
        raise HTTPException(401, "Invalid login or password")

    def no_database():
        yield None

    monkeypatch.setattr(auth, "authenticate_user", reject_login)
    app.dependency_overrides[get_db] = no_database
    try:
        with TestClient(app) as client:
            data = {"login": " Student ", "password": "WrongPassword123!"}
            for _ in range(10):
                assert client.post("/auth/login", json=data).status_code == 401
            response = client.post("/auth/login", json={**data, "login": "student"})
            assert response.status_code == 429
            assert "retry-after" in response.headers
            assert len(calls) == 10
            # Changing logins still consumes the shared IP budget; registration shares it.
            for i in range(19):
                assert client.post("/auth/login", json={**data, "login": f"user{i}"}).status_code == 401
            assert client.post("/auth/register", json=data).status_code == 429
    finally:
        app.dependency_overrides.pop(get_db, None)
