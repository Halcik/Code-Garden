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

@pytest.mark.parametrize("name,expected", [(None, 401), ("student", 403), ("admin", 403)])
def test_write_access(client, task_users, name, expected):
    authenticate(client, task_users, name)
    assert client.post("/teacher/tasks", json={"title": "New", "topic": "Python", "difficulty": "EASY", "task_type": "STANDARD"}).status_code == expected
    assert client.get("/teacher/tasks/1").status_code == expected
    assert client.patch("/teacher/tasks/1", json={"title": "Changed"}).status_code == expected


def test_create_edit_and_ownership(client, task_users):
    authenticate(client, task_users, "first")
    payload = {"title": " New task ", "topic": " Python ", "difficulty": "EASY", "task_type": "STANDARD", "estimated_time_minutes": 20}
    response = client.post("/teacher/tasks", json=payload)
    assert response.status_code == 201
    task = response.json()
    assert task["author_id"] == task_users["first"]
    assert task["title"] == "New task"
    assert task["status"] == "DRAFT"
    path = f'/teacher/tasks/{task["id"]}'
    assert client.get(path).json() == task
    assert any(item["id"] == task["id"] for item in client.get("/teacher/tasks").json()["items"])
    patched = client.patch(path, json={"title": "Changed", "estimated_time_minutes": None, "status": "READY"})
    assert patched.status_code == 200
    assert patched.json()["topic"] == "Python"
    assert patched.json()["estimated_time_minutes"] is None
    assert client.get(path).json()["title"] == "Changed"
    authenticate(client, task_users, "second")
    assert client.get(path).status_code == 404
    assert client.patch(path, json={"title": "Stolen"}).status_code == 404
    authenticate(client, task_users, "first")
    assert client.get(path).json()["title"] == "Changed"
    assert client.get("/teacher/tasks/2147483647").status_code == 404
    for invalid in [{"title": " "}, {"topic": " "}, {"difficulty": "INVALID"}, {"status": "PUBLIC"},
                    {"task_type": "INVALID"}, {"title": None}, {"description": None}, {"status": None},
                    {"estimated_time_minutes": 0}, {"estimated_time_minutes": -1}, {"estimated_time_minutes": 1.5},
                    {"author_id": task_users["second"]}, {"title": "x" * 201}, {"topic": "x" * 101}]:
        assert client.post("/teacher/tasks", json={**payload, **invalid}).status_code == 422
        assert client.patch(path, json=invalid).status_code == 422
    assert client.patch(path, json={}).status_code == 422

@pytest.mark.parametrize("name,expected", [(None, 401), ("student", 403), ("admin", 403)])
@pytest.mark.parametrize("action", ["archive", "restore"])
def test_archive_roles(client, task_users, name, expected, action):
    authenticate(client, task_users, name)
    assert client.patch(f"/teacher/tasks/1/{action}").status_code == expected


def test_archive_restore_lifecycle(client, task_users):
    authenticate(client, task_users, "first")
    task = client.post("/teacher/tasks", json={"title": "Archive lifecycle", "topic": "Python",
                                             "difficulty": "HARD", "task_type": "FUNCTION", "status": "READY"}).json()
    assert task["is_archived"] is False
    path = f'/teacher/tasks/{task["id"]}'
    archived = client.patch(f"{path}/archive")
    assert archived.status_code == 200
    assert archived.headers["cache-control"] == "no-store"
    assert archived.json()["is_archived"] is True
    assert archived.json()["status"] == "READY"
    assert client.patch(f"{path}/archive").json() == archived.json()
    assert client.get(path).json()["is_archived"] is True
    assert client.patch(path, json={"title": "Blocked"}).status_code == 409
    assert client.get(path).json()["title"] == task["title"]
    all_tasks = client.get("/teacher/tasks").json()
    archive_tasks = client.get("/teacher/tasks?archived=true").json()
    active_tasks = client.get("/teacher/tasks?archived=false").json()
    assert all_tasks["total"] == archive_tasks["total"] + active_tasks["total"]
    assert any(item["id"] == task["id"] for item in all_tasks["items"])
    assert any(item["id"] == task["id"] for item in archive_tasks["items"])
    assert all(item["is_archived"] for item in archive_tasks["items"])
    assert all(not item["is_archived"] for item in active_tasks["items"])
    filtered = client.get("/teacher/tasks?archived=true&status=READY&difficulty=HARD&q=Archive&topic=Python").json()
    assert any(item["id"] == task["id"] for item in filtered["items"])
    assert client.get("/teacher/tasks?archived=invalid").status_code == 422
    restored = client.patch(f"{path}/restore")
    assert restored.status_code == 200
    assert restored.json()["is_archived"] is False
    assert restored.json()["status"] == "READY"
    assert client.patch(f"{path}/restore").json() == restored.json()
    assert not any(item["id"] == task["id"] for item in client.get("/teacher/tasks?archived=true").json()["items"])
    assert client.patch(path, json={"title": "Editable again"}).status_code == 200


def test_archive_ownership_and_input(client, task_users):
    authenticate(client, task_users, "second")
    task = client.post("/teacher/tasks", json={"title": "Private archive", "topic": "Python", "difficulty": "EASY", "task_type": "STANDARD"}).json()
    path = f'/teacher/tasks/{task["id"]}'
    authenticate(client, task_users, "first")
    for action in ("archive", "restore"):
        assert client.patch(f"{path}/{action}").status_code == 404
        assert client.patch(f"/teacher/tasks/2147483647/{action}").status_code == 404
    authenticate(client, task_users, "second")
    assert client.get(path).json()["is_archived"] is False
    for action in ("archive", "restore"):
        for body in ({"author_id": task_users["first"]}, {"is_archived": True}, {"title": "Sneaky"}):
            assert client.patch(f"{path}/{action}", json=body).status_code == 422
        assert client.patch(f"{path}/{action}", headers={"Origin": "https://untrusted.example"}).status_code == 403
    assert client.patch(path, json={"is_archived": True}).status_code == 422
    assert client.post("/teacher/tasks", json={"title": "Sneaky", "topic": "Python", "difficulty": "EASY", "task_type": "STANDARD", "is_archived": True}).status_code == 422
    client.patch(f"{path}/archive")
    authenticate(client, task_users, "first")
    assert client.patch(f"{path}/restore").status_code == 404
    authenticate(client, task_users, "second")
    assert client.get(path).json()["is_archived"] is True
