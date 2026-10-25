from unittest.mock import AsyncMock
from types import SimpleNamespace

import pytest
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.student import get_judge0_service
from app.core.config import get_settings
from app.core.security import create_access_token
from app.main import app
from app.models.task import Task
from app.models.user import User, UserRole, TeacherApproval


@pytest.fixture(scope="module")
def actors(client, db_engine):
    ids = {}
    with Session(db_engine) as db:
        for role in UserRole:
            user = User(login=f"run_{role.value}", email=f"run_{role.value}@example.com", role=role,
                        password_hash="unused", teacher_approval=TeacherApproval.APPROVED if role == UserRole.TEACHER else None)
            db.add(user)
            db.flush()
            ids[role.value] = user.id
        db.commit()
    return ids


def login(client, actors, role):
    client.cookies.clear()
    if role:
        client.cookies.set(get_settings().cookie_name, create_access_token(actors[role]))


def create(client):
    response = client.post("/teacher/tasks", json={"title": "Run", "topic": "Python", "difficulty": "EASY",
        "task_type": "STANDARD", "status": "READY", "instructions": "Read stdin"})
    assert response.status_code == 201
    return response.json()


@pytest.mark.parametrize("version", ["3.11", "3.12", "3.13", "3.14"])
def test_teacher_roundtrip_and_student_run(client, db_engine, actors, version):
    login(client, actors, "TEACHER")
    task = create(client)
    assert task["python_version"] == "3.13"
    assert task["time_limit_seconds"] == 2 and task["memory_limit_mb"] == 256
    settings = {"python_version": version, "time_limit_seconds": 1.5, "memory_limit_mb": 128}
    assert client.patch(f"/teacher/tasks/{task['id']}", json=settings).status_code == 200
    saved = client.get(f"/teacher/tasks/{task['id']}").json()
    assert all(saved[key] == value for key, value in settings.items())
    service = SimpleNamespace(run_code=AsyncMock(return_value={"status": "completed", "stdout": "hello"}))
    app.dependency_overrides[get_judge0_service] = lambda: service
    try:
        with Session(db_engine) as db:
            before = db.scalar(select(func.count()).select_from(Task))
        login(client, actors, "STUDENT")
        assert client.post(f"/student/tasks/{task['id']}/run", json={"source_code": "print(input())", "stdin": "hello"}).status_code == 200
        service.run_code.assert_awaited_once_with(source_code="print(input())", stdin="hello", **settings)
        with Session(db_engine) as db:
            assert db.scalar(select(func.count()).select_from(Task)) == before
    finally:
        app.dependency_overrides.pop(get_judge0_service, None)


@pytest.mark.parametrize("kind", ["DRAFT", "archived", "missing"])
def test_hidden_tasks_cannot_run(client, actors, kind):
    login(client, actors, "TEACHER")
    task = create(client)
    if kind == "DRAFT":
        client.patch(f"/teacher/tasks/{task['id']}", json={"status": "DRAFT"})
    if kind == "archived":
        client.patch(f"/teacher/tasks/{task['id']}/archive")
    login(client, actors, "STUDENT")
    task_id = 999999 if kind == "missing" else task['id']
    assert client.post(f"/student/tasks/{task_id}/run", json={"source_code": "x"}).status_code == 404


@pytest.mark.parametrize("role,status", [(None,401), ("TEACHER",403), ("ADMIN",403)])
def test_run_requires_student_cookie(client, actors, role, status):
    login(client, actors, role)
    assert client.post("/student/tasks/1/run", json={"source_code": "x"}).status_code == status


def test_teacher_version_catalog_is_central_and_hides_ids(client, actors):
    login(client, actors, "TEACHER")
    response = client.get("/teacher/execution-environments")
    assert response.status_code == 200
    assert response.json() == list(get_settings().judge0_python_languages)
    assert all(isinstance(value, str) for value in response.json())
    login(client, actors, "STUDENT")
    assert client.get("/teacher/execution-environments").status_code == 403
