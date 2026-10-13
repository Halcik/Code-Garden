"""Run only against an explicitly configured, disposable *_test PostgreSQL DB."""
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.core.config import get_settings
from app.db.session import get_db
from app.main import app
from sqlalchemy.orm import Session


@pytest.fixture(scope="module")
def client():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database ending in _test")
    if not make_url(url).database.endswith("_test"):
        pytest.fail("TEST_DATABASE_URL database must end in _test")
    env = {**os.environ, "DATABASE_URL": url}
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"],
                   cwd=Path(__file__).resolve().parents[1], env=env, check=True)
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE users RESTART IDENTITY"))
    def override_db():
        with Session(engine) as session:
            yield session
    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    engine.dispose()


def test_auth_flow(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/auth/me").status_code == 401
    student = {"login": "Student", "password": "ExamplePassword123!", "role": "STUDENT"}
    result = client.post("/auth/register", json=student)
    assert result.status_code == 201
    assert result.json()["email"] is None
    assert "password_hash" not in result.json() and "password" not in result.json()
    assert client.post("/auth/register", json=student).status_code == 409
    assert client.post("/auth/register", json={**student, "login": "admin", "role": "ADMIN"}).status_code == 422
    assert client.post("/auth/register", json={**student, "login": "teacher", "role": "TEACHER"}).status_code == 422
    teacher = {**student, "login": "teacher", "role": "TEACHER", "email": "teacher@example.com"}
    assert client.post("/auth/register", json=teacher).status_code == 201
    assert client.post("/auth/register", json={**teacher, "login": "other"}).status_code == 409
    assert client.post("/auth/register", json={**student, "login": "second"}).status_code == 201
    assert client.post("/auth/login", json={"login": "student", "password": "WrongPassword123"}).status_code == 401
    assert client.post("/auth/login", json={"login": "unknown", "password": "WrongPassword123"}).status_code == 401
    login = client.post("/auth/login", json={"login": "student", "password": student["password"]})
    assert login.status_code == 200
    cookie = login.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/" in cookie
    assert "Secure" not in cookie
    assert "token" not in login.json()
    assert client.get("/auth/me").json()["login"] == "student"
    assert client.post("/auth/logout").status_code == 204
    assert client.get("/auth/me").status_code == 401
    client.cookies.set(get_settings().cookie_name, "invalid")
    assert client.get("/auth/me").status_code == 401
    client.cookies.clear()


def test_origin_and_cors(client):
    assert client.post("/auth/logout", headers={"Origin": "https://evil.example"}).status_code == 403
    response = client.options("/auth/login", headers={"Origin": "http://localhost:5173",
                                                     "Access-Control-Request-Method": "POST",
                                                     "Access-Control-Request-Headers": "content-type"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-credentials"] == "true"
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_secure_cookie(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "cookie_secure", True)
    response = client.post("/auth/login", json={"login": "student", "password": "ExamplePassword123!"})
    assert "Secure" in response.headers["set-cookie"]
    assert "Secure" in client.post("/auth/logout").headers["set-cookie"]
    client.cookies.clear()
