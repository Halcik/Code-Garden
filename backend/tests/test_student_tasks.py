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
    assert set(data["items"][0]) == {"id", "title", "description", "topic", "difficulty", "task_type", "estimated_time_minutes", "progress_status"}
    assert all(item["progress_status"] == "NOT_STARTED" for item in data["items"])


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


@pytest.mark.parametrize("status", [None, "NOT_STARTED", "IN_PROGRESS", "COMPLETED"])
def test_personal_progress_filters_and_pagination(client, catalog_users, db_engine, status):
    from app.models.solution import SolutionDraft, Submission
    topic = f"Progress {status}"
    ids = {}
    with Session(db_engine) as db:
        other = User(login=f"other_progress_{status}", email=f"other_progress_{status}@example.com",
                     password_hash="unused", role=UserRole.STUDENT)
        db.add(other); db.flush()
        for state in ("NOT_STARTED", "IN_PROGRESS", "COMPLETED"):
            task = Task(title=state, topic=topic, author_id=catalog_users["TEACHER"],
                        difficulty=TaskDifficulty.EASY, task_type=TaskType.STANDARD, status=TaskStatus.READY)
            db.add(task); db.flush(); ids[state] = task.id
            if state != "NOT_STARTED":
                db.add(SolutionDraft(student_id=catalog_users["STUDENT"], task_id=task.id, source_code="newer draft"))
            # Failed submissions still count as completed. Another student's submission does not.
            if state != "IN_PROGRESS":
                db.add(Submission(student_id=catalog_users["STUDENT"] if state == "COMPLETED" else other.id,
                    task_id=task.id, version=1, source_code="old code", summary={"passed_tests": 0,
                    "failed_tests": 2, "total_tests": 2, "all_passed": False}))
        db.commit()
    authenticate(client, catalog_users, "STUDENT")
    params = {"topic": topic, "limit": 1, "sort_by": "title", "sort_order": "asc"}
    if status: params["progress_status"] = status
    response = client.get("/student/tasks", params=params)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == (1 if status else 3)
    assert data["progress_counts"] == {"NOT_STARTED": 1, "IN_PROGRESS": 1, "COMPLETED": 1}
    assert len(data["items"]) == 1
    if status:
        assert data["items"][0]["id"] == ids[status]
        assert data["items"][0]["progress_status"] == status
    else:
        params["limit"] = 24
        items = client.get("/student/tasks", params=params).json()["items"]
        assert {item["id"]: item["progress_status"] for item in items} == {value: key for key, value in ids.items()}


def test_unknown_progress_filter_is_rejected(client, catalog_users):
    authenticate(client, catalog_users, "STUDENT")
    assert client.get("/student/tasks?progress_status=UNKNOWN").status_code == 422
