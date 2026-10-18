from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token
from app.models.task import Task
from app.models.user import User, UserRole, TeacherApproval


def test_create_task_with_ordered_children_atomically(client, db_engine):
    with Session(db_engine) as db:
        teacher = User(login="draft_teacher", email="draft@example.com", role=UserRole.TEACHER,
                       teacher_approval=TeacherApproval.APPROVED, password_hash="unused")
        db.add(teacher)
        db.commit()
        teacher_id = teacher.id
    client.cookies.set(get_settings().cookie_name, create_access_token(teacher_id))
    payload = {
        "title": "Draft task", "topic": "Python", "difficulty": "EASY", "task_type": "STANDARD",
        "tests": [
            {"name": "Second first", "test_type": "INPUT_OUTPUT", "config": {"expected_output": "5\n"}},
            {"name": "First second", "test_type": "STRUCTURAL", "config": {"rule_type": "USES_FOR"}},
        ],
        "hints": [{"title": "Direction", "content": "Think"}, {"title": "Detail", "content": "Use a loop"}],
    }
    # A bad child prevents creation of the task and every other child.
    for field, invalid in [("hints", [{"title": " ", "content": "x"}]),
                           ("tests", [{"name": "x", "test_type": "FUNCTION", "config": {}}])]:
        response = client.post("/teacher/tasks", json={**payload, field: invalid})
        assert response.status_code == 422, response.text
        with Session(db_engine) as db:
            assert db.scalar(select(func.count()).select_from(Task)) == 0
    response = client.post("/teacher/tasks", json=payload)
    assert response.status_code == 201, response.text
    task = response.json()
    assert task["author_id"] == teacher_id
    path = f'/teacher/tasks/{task["id"]}'
    tests = client.get(path + "/tests").json()
    hints = client.get(path + "/hints").json()
    assert [item["name"] for item in tests] == ["Second first", "First second"]
    assert [item["position"] for item in tests] == [1, 2]
    assert tests[0]["config"]["expected_output"] == "5\n"
    assert [item["title"] for item in hints] == ["Direction", "Detail"]
    assert [item["position"] for item in hints] == [1, 2]
    assert all(item["task_id"] == task["id"] for item in tests + hints)
