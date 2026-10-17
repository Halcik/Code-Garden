import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session
from app.schemas.task_test import TaskTestWrite
from app.models.user import User, UserRole, TeacherApproval
from app.core.config import get_settings
from app.core.security import create_access_token


CASES = [
    {"test_type": "INPUT_OUTPUT", "config": {"input_data": "", "expected_output": "5\n"}},
    {"test_type": "FUNCTION", "config": {"function_name": "area", "arguments": [2, 3], "expected_result": 6}},
    {"test_type": "STRUCTURAL", "config": {"rule_type": "USES_FOR"}},
]


@pytest.mark.parametrize("name", ["print", "input", "len", "range", "sum"])
def test_calls_function_config(name):
    test = TaskTestWrite(name="Function call", test_type="STRUCTURAL",
                         config={"rule_type": "CALLS_FUNCTION", "expected_value": name})
    assert test.config == {"rule_type": "CALLS_FUNCTION", "expected_value": name}


@pytest.mark.parametrize("case", CASES)
def test_config_validation(case):
    for hidden in [True, False]:
        assert TaskTestWrite(name="Example", is_hidden=hidden, **case).is_hidden == hidden


@pytest.mark.parametrize("kind,config", [
    ("INPUT_OUTPUT", {}), ("INPUT_OUTPUT", {"expected_output": ""}),
    ("FUNCTION", {"function_name": " ", "arguments": [], "expected_result": None}),
    ("FUNCTION", {"function_name": "f", "arguments": "[]", "expected_result": 1}),
    ("FUNCTION", {"function_name": "f", "arguments": []}),
    ("STRUCTURAL", {"rule_type": "FUNCTION_EXISTS"}),
    ("STRUCTURAL", {"rule_type": "CALLS_FUNCTION"}),
    ("STRUCTURAL", {"rule_type": "CALLS_FUNCTION", "expected_value": " "}),
    ("STRUCTURAL", {"rule_type": "USES_IF", "expected_value": "x"}),
    ("STRUCTURAL", {"rule_type": "UNKNOWN"}),
])
def test_invalid_config(kind, config):
    with pytest.raises(ValidationError):
        TaskTestWrite(name="Example", test_type=kind, config=config)


def test_test_lifecycle_and_security(client, db_engine):
    with Session(db_engine) as db:
        users = [User(login=f"tests_{i}", email=f"tests_{i}@example.com", role=role,
                      teacher_approval=TeacherApproval.APPROVED if role == UserRole.TEACHER else None,
                      password_hash="unused") for i, role in enumerate([UserRole.TEACHER, UserRole.TEACHER, UserRole.STUDENT])]
        db.add_all(users)
        db.commit()
        ids = [u.id for u in users]

    def auth(index):
        client.cookies.clear()
        client.cookies.set(get_settings().cookie_name, create_access_token(ids[index]))

    auth(0)
    task = client.post('/teacher/tasks', json={"title": "Tests", "topic": "Python", "difficulty": "EASY", "task_type": "STANDARD"}).json()
    path = f'/teacher/tasks/{task["id"]}/tests'
    items = []
    for case in CASES:
        response = client.post(path, json={"name": "Example", **case})
        assert response.status_code == 201, response.text
        items.append(response.json())
    assert [t['position'] for t in items] == [1, 2, 3]
    test_id = items[0]['id']
    assert client.patch(f'{path}/{test_id}', json={"is_hidden": True}).json()['is_hidden'] is True
    assert client.patch(f'{path}/{test_id}', json={"name": " "}).status_code == 422
    reverse = [t['id'] for t in reversed(items)]
    assert client.patch(path + '/reorder', json={"test_ids": reverse}).status_code == 200
    assert [t['id'] for t in client.get(path).json()] == reverse
    for invalid in [reverse[:-1], [test_id] * 3, reverse + [999999]]:
        assert client.patch(path + '/reorder', json={"test_ids": invalid}).status_code == 422
    assert client.delete(f'{path}/{test_id}').status_code == 204
    assert [t['position'] for t in client.get(path).json()] == [1, 2]
    remaining = client.get(path).json()[0]['id']
    for index, status in [(1, 404), (2, 403)]:
        auth(index)
        assert client.get(path).status_code == status
        assert client.post(path, json={"name": "x", **CASES[0]}).status_code == status
        assert client.patch(f'{path}/{remaining}', json={"name": "x"}).status_code == status
        assert client.delete(f'{path}/{remaining}').status_code == status
        assert client.patch(path + '/reorder', json={"test_ids": []}).status_code == status
    auth(0)
    assert client.patch(f'/teacher/tasks/{task["id"]}/archive').status_code == 200
    assert client.get(path).status_code == 200
    assert client.post(path, json={"name": "x", **CASES[0]}).status_code == 409
    assert client.patch(f'{path}/{remaining}', json={"name": "x"}).status_code == 409
    assert client.delete(f'{path}/{remaining}').status_code == 409
    assert client.patch(path + '/reorder', json={"test_ids": []}).status_code == 409
