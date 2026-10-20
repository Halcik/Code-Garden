import pytest
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token
from app.models.task import Task, TaskDifficulty, TaskStatus, TaskType
from app.models.user import User, UserRole, TeacherApproval


@pytest.fixture(scope="module")
def catalog_users(client, db_engine):
    with Session(db_engine) as db:
        users = {}
        for role in UserRole:
            user = User(login=f"catalog_{role.value}", password_hash="unused", role=role,
                        email=f"catalog_{role.value}@example.com",
                        teacher_approval=TeacherApproval.APPROVED if role == UserRole.TEACHER else None)
            db.add(user)
            db.flush()
            users[role.value] = user.id
        for title, status, archived, difficulty in [
            ("Alpha_100%", TaskStatus.READY, False, TaskDifficulty.EASY),
            ("Beta", TaskStatus.READY, False, TaskDifficulty.HARD),
            ("Draft", TaskStatus.DRAFT, False, TaskDifficulty.EASY),
            ("Archived", TaskStatus.READY, True, TaskDifficulty.EASY),
        ]:
            db.add(Task(title=title, topic="Podstawy", author_id=users["TEACHER"],
                        difficulty=difficulty, task_type=TaskType.STANDARD,
                        status=status, is_archived=archived, instructions="Secret instructions"))
        db.commit()
        return users


def authenticate(client, users, role):
    client.cookies.clear()
    if role:
        client.cookies.set(get_settings().cookie_name, create_access_token(users[role]))


@pytest.mark.parametrize("role,status", [(None, 401), ("TEACHER", 403), ("ADMIN", 403)])
def test_catalog_access(client, catalog_users, role, status):
    authenticate(client, catalog_users, role)
    assert client.get("/student/tasks").status_code == status


def test_catalog_visibility_and_response(client, catalog_users):
    authenticate(client, catalog_users, "STUDENT")
    response = client.get("/student/tasks", params={"sort_by": "title", "sort_order": "asc"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    data = response.json()
    assert data["total"] == 2
    assert [item["title"] for item in data["items"]] == ["Alpha_100%", "Beta"]
    assert set(data["items"][0]) == {"id", "title", "description", "topic", "difficulty", "task_type", "estimated_time_minutes"}


@pytest.mark.parametrize("params,titles", [
    ({"search": " ALPHA "}, ["Alpha_100%"]),
    ({"search": "%"}, ["Alpha_100%"]),
    ({"search": "_"}, ["Alpha_100%"]),
    ({"topic": " podstawy ", "difficulty": "HARD", "task_type": "STANDARD"}, ["Beta"]),
    ({"task_type": "FUNCTION"}, []),
    ({"sort_by": "title", "sort_order": "asc", "limit": 1, "offset": 1}, ["Beta"]),
])
def test_catalog_query(client, catalog_users, params, titles):
    authenticate(client, catalog_users, "STUDENT")
    response = client.get("/student/tasks", params=params)
    assert response.status_code == 200
    assert [item["title"] for item in response.json()["items"]] == titles


@pytest.mark.parametrize("params", [{"sort_by": "author_id"}, {"difficulty": "INVALID"},
                                     {"task_type": "INVALID"}, {"sort_order": "INVALID"},
                                     {"offset": -1}, {"limit": 101}, {"search": "x" * 201}])
def test_catalog_validation(client, catalog_users, params):
    authenticate(client, catalog_users, "STUDENT")
    assert client.get("/student/tasks", params=params).status_code == 422
