"""Exercises the actual API and migrations on the disposable PostgreSQL database."""
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token
from app.models.task import Task, TaskDifficulty, TaskStatus, TaskType
from app.models.user import User, UserRole, TeacherApproval


@pytest.fixture(scope="module")
def task_users(client, db_engine):
    ids = {}
    with Session(db_engine) as db:
        for name, role in [("first", UserRole.TEACHER), ("second", UserRole.TEACHER),
                           ("empty", UserRole.TEACHER), ("student", UserRole.STUDENT),
                           ("admin", UserRole.ADMIN)]:
            user = User(login=name, email=f"{name}@example.com", role=role,
                        teacher_approval=TeacherApproval.APPROVED if role == UserRole.TEACHER else None,
                        password_hash="unused")
            db.add(user)
            db.flush()
            ids[name] = user.id
        for title, author, difficulty, status in [
            ("Alpha_100%", "first", TaskDifficulty.EASY, TaskStatus.DRAFT),
            ("Beta", "first", TaskDifficulty.HARD, TaskStatus.READY),
            ("Alpha other", "second", TaskDifficulty.EASY, TaskStatus.DRAFT),
        ]:
            db.add(Task(title=title, topic="Pętle", author_id=ids[author], difficulty=difficulty,
                        task_type=TaskType.STANDARD, status=status))
        db.commit()
    return ids


def authenticate(client, ids, name):
    client.cookies.clear()
    if name:
        client.cookies.set(get_settings().cookie_name, create_access_token(ids[name]))


@pytest.mark.parametrize("name,expected", [(None, 401), ("student", 403), ("admin", 403)])
def test_access(client, task_users, name, expected):
    authenticate(client, task_users, name)
    assert client.get("/teacher/tasks").status_code == expected


def test_author_isolation_and_empty_list(client, task_users):
    for name, expected in [("first", 2), ("second", 1), ("empty", 0)]:
        authenticate(client, task_users, name)
        response = client.get("/teacher/tasks")
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        data = response.json()
        assert data["total"] == expected
        assert all(task["author_id"] == task_users[name] for task in data["items"])


def test_filters_search_sort_and_pagination(client, task_users):
    authenticate(client, task_users, "first")
    for params, titles in [
        ({"q": " alpha "}, ["Alpha_100%"]),
        ({"q": "%"}, ["Alpha_100%"]),
        ({"q": "_"}, ["Alpha_100%"]),
        ({"difficulty": "HARD", "status": "READY", "topic": " pętle "}, ["Beta"]),
        ({"status": "READY", "difficulty": "EASY"}, []),
        ({"q": "missing"}, []),
        ({"sort_by": "title", "sort_order": "asc", "limit": 1}, ["Alpha_100%"]),
        ({"sort_by": "title", "sort_order": "asc", "limit": 1, "offset": 1}, ["Beta"]),
    ]:
        response = client.get("/teacher/tasks", params=params)
        assert response.status_code == 200
        assert [task["title"] for task in response.json()["items"]] == titles
    for params in [{"difficulty": "INVALID"}, {"status": "PUBLIC"}, {"sort_by": "author_id"},
                   {"sort_order": "INVALID"}, {"limit": 101}, {"offset": -1}, {"q": "x" * 201}]:
        assert client.get("/teacher/tasks", params=params).status_code == 422


def test_database_author_validation_and_update_timestamp(task_users, db_engine):
    with Session(db_engine) as db:
        with pytest.raises(IntegrityError):
            db.execute(text("INSERT INTO tasks (title, topic, difficulty, task_type, author_id) "
                            "VALUES ('Invalid', 'Pętle', 'EASY', 'STANDARD', :author)"),
                       {"author": task_users["student"]})
        db.rollback()
        before = db.execute(text("SELECT id, updated_at FROM tasks WHERE author_id = :author LIMIT 1"),
                            {"author": task_users["first"]}).one()
        updated = db.execute(text("UPDATE tasks SET description = 'Changed' WHERE id = :id RETURNING updated_at"),
                             {"id": before.id}).scalar_one()
        assert updated > before.updated_at
        db.rollback()
