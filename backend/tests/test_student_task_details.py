import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token
from app.models.task import Task, TaskDifficulty, TaskHint, TaskStatus, TaskTest, TaskType
from app.models.user import AccountStatus, TeacherApproval, User, UserRole


@pytest.fixture(scope="module")
def detail_data(client, db_engine):
    with Session(db_engine) as db:
        ids = {}
        for name, role in [("teacher", UserRole.TEACHER), ("other_teacher", UserRole.TEACHER),
                           ("student", UserRole.STUDENT), ("admin", UserRole.ADMIN),
                           ("inactive", UserRole.STUDENT)]:
            user = User(login=f"detail_{name}", email=f"detail_{name}@example.com", role=role,
                        password_hash="unused", status=AccountStatus.INACTIVE if name == "inactive" else AccountStatus.ACTIVE,
                        teacher_approval=TeacherApproval.APPROVED if role == UserRole.TEACHER else None)
            db.add(user)
            db.flush()
            ids[name] = user.id
        for name, status, archived, author in [
            ("ready", TaskStatus.READY, False, "teacher"),
            ("other", TaskStatus.READY, False, "other_teacher"),
            ("draft", TaskStatus.DRAFT, False, "teacher"),
            ("archived", TaskStatus.READY, True, "teacher"),
        ]:
            task = Task(title=f"Detail {name}", topic="Napisy", description="Opis\nDrugi akapit",
                        instructions="Pełne polecenie", theory="Krótka teoria" if name == "ready" else None,
                        starter_code="def solve():\n    pass\n" if name == "ready" else None,
                        difficulty=TaskDifficulty.EASY, task_type=TaskType.FUNCTION,
                        estimated_time_minutes=20 if name == "ready" else None,
                        status=status, is_archived=archived, author_id=ids[author])
            db.add(task)
            db.flush()
            ids[name] = task.id
            if name == "ready":
                db.add(TaskHint(task_id=task.id, position=1, title="Secret hint", content="Secret solution"))
                db.add(TaskHint(task_id=task.id, position=4, title="Last hint", content="Last content"))
                db.add(TaskHint(task_id=task.id, position=2, title="Second hint", content="Second content"))
                db.add(TaskTest(task_id=task.id, position=1, name="Secret test", test_type="INPUT_OUTPUT",
                                config={"input_data": "secret", "expected_output": "secret result"}, is_hidden=True))
        db.commit()
        return ids


def authenticate(client, ids, name):
    client.cookies.clear()
    if name:
        client.cookies.set(get_settings().cookie_name, create_access_token(ids[name]))


@pytest.mark.parametrize("name,status", [(None, 401), ("teacher", 403), ("admin", 403), ("inactive", 403)])
def test_student_detail_access(client, detail_data, name, status):
    authenticate(client, detail_data, name)
    assert client.get(f"/student/tasks/{detail_data['ready']}").status_code == status


def test_student_detail_contract(client, detail_data):
    authenticate(client, detail_data, "student")
    response = client.get(f"/student/tasks/{detail_data['ready']}")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "id": detail_data["ready"], "title": "Detail ready", "topic": "Napisy",
        "description": "Opis\nDrugi akapit", "instructions": "Pełne polecenie", "theory": "Krótka teoria",
        "starter_code": "def solve():\n    pass\n", "difficulty": "EASY", "task_type": "FUNCTION",
        "estimated_time_minutes": 20,
    }
    # The exact field allowlist also excludes test configs, hints and teacher metadata.
    assert "Secret" not in response.text


def test_student_can_read_tasks_from_another_author_with_nullable_content(client, detail_data):
    authenticate(client, detail_data, "student")
    response = client.get(f"/student/tasks/{detail_data['other']}")
    assert response.status_code == 200
    assert response.json()["starter_code"] is None
    assert response.json()["theory"] is None
    assert response.json()["estimated_time_minutes"] is None


@pytest.mark.parametrize("name", ["draft", "archived", "missing"])
def test_unavailable_tasks_are_indistinguishable_from_missing_tasks(client, detail_data, name):
    authenticate(client, detail_data, "student")
    response = client.get(f"/student/tasks/{detail_data.get(name, 999999)}")
    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found"}
    assert response.headers["cache-control"] == "no-store"


def test_task_archived_after_catalog_load_is_no_longer_readable(client, detail_data, db_engine):
    authenticate(client, detail_data, "student")
    task_id = detail_data["ready"]
    assert task_id in [item["id"] for item in client.get("/student/tasks").json()["items"]]
    with Session(db_engine) as db:
        task = db.get(Task, task_id)
        task.is_archived = True
        db.commit()
    try:
        assert client.get(f"/student/tasks/{task_id}").status_code == 404
        assert client.get(f"/student/tasks/{task_id}/hints").status_code == 404
        assert client.get(f"/student/tasks/{task_id}/hints/1").status_code == 404
        assert task_id not in [item["id"] for item in client.get("/student/tasks").json()["items"]]
    finally:
        with Session(db_engine) as db:
            db.get(Task, task_id).is_archived = False
            db.commit()


def test_detail_does_not_expose_a_student_write_endpoint(client, detail_data, db_engine):
    authenticate(client, detail_data, "student")
    response = client.patch(f"/student/tasks/{detail_data['ready']}", json={"starter_code": "student edit"})
    assert response.status_code == 405
    with Session(db_engine) as db:
        assert db.scalar(select(Task.starter_code).where(Task.id == detail_data["ready"])) == "def solve():\n    pass\n"


@pytest.mark.parametrize("suffix", ["hints", "hints/1"])
@pytest.mark.parametrize("name,status", [(None, 401), ("teacher", 403), ("admin", 403), ("inactive", 403)])
def test_student_hints_access(client, detail_data, suffix, name, status):
    authenticate(client, detail_data, name)
    assert client.get(f"/student/tasks/{detail_data['ready']}/{suffix}").status_code == status


def test_hint_summary_returns_only_count_without_any_hint_content(client, detail_data):
    authenticate(client, detail_data, "student")
    response = client.get(f"/student/tasks/{detail_data['ready']}/hints")
    assert response.status_code == 200
    assert response.json() == {"total": 3, "revealed": []}
    assert response.headers["cache-control"] == "no-store"


def test_hints_are_revealed_individually_in_teacher_order_even_with_position_gaps(client, detail_data):
    authenticate(client, detail_data, "student")
    for number, title, content in [(1, "Secret hint", "Secret solution"), (2, "Second hint", "Second content"), (3, "Last hint", "Last content")]:
        assert client.post(f"/student/tasks/{detail_data['ready']}/hints/{number}/reveal").status_code == 200
        response = client.get(f"/student/tasks/{detail_data['ready']}/hints/{number}")
        assert response.status_code == 200
        assert response.json() == {"number": number, "title": title, "content": content}
        assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("name", ["draft", "archived", "missing"])
@pytest.mark.parametrize("suffix", ["hints", "hints/1"])
def test_hints_never_reveal_content_for_unavailable_tasks(client, detail_data, name, suffix):
    authenticate(client, detail_data, "student")
    response = client.get(f"/student/tasks/{detail_data.get(name, 999999)}/{suffix}")
    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found"}
    assert response.headers["cache-control"] == "no-store"


def test_hint_queries_are_scoped_to_the_selected_task(client, detail_data):
    authenticate(client, detail_data, "student")
    assert client.get(f"/student/tasks/{detail_data['other']}/hints").json() == {"total": 0, "revealed": []}
    assert client.get(f"/student/tasks/{detail_data['other']}/hints/1").status_code == 404


@pytest.mark.parametrize("number", [0, -1, 4, 999999])
def test_nonexistent_hint_number_returns_404(client, detail_data, number):
    authenticate(client, detail_data, "student")
    response = client.get(f"/student/tasks/{detail_data['ready']}/hints/{number}")
    assert response.status_code == 404
    assert response.json() == {"detail": "Hint not found"}


def test_student_hints_do_not_expose_teacher_mutations(client, detail_data):
    authenticate(client, detail_data, "student")
    path = f"/student/tasks/{detail_data['ready']}/hints"
    assert client.post(path, json={"title": "X", "content": "Y"}).status_code == 405
    assert client.patch(path + "/1", json={"content": "Changed"}).status_code == 405
    assert client.delete(path + "/1").status_code == 405
    assert client.post(path + "/1/reveal").status_code == 200
    assert client.get(path + "/1").json()["content"] == "Secret solution"
