import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session
from app.schemas.task_hint import TaskHintWrite, TaskHintPatch
from app.models.user import User, UserRole, TeacherApproval
from app.core.config import get_settings
from app.core.security import create_access_token


@pytest.mark.parametrize("schema,payload", [
    (TaskHintWrite, {"title": " ", "content": "x"}),
    (TaskHintWrite, {"title": "x", "content": "\n\t"}),
    (TaskHintWrite, {"title": "x"}),
    (TaskHintWrite, {"title": "x" * 201, "content": "x"}),
    (TaskHintPatch, {}), (TaskHintPatch, {"title": None}),
    (TaskHintPatch, {"content": " "}), (TaskHintPatch, {"position": 2}),
])
def test_hint_validation(schema, payload):
    with pytest.raises(ValidationError):
        schema.model_validate(payload)


def test_hint_trims_fields():
    assert TaskHintWrite(title=" Direction ", content=" Think ").model_dump() == {"title": "Direction", "content": "Think"}


def test_hint_lifecycle_and_security(client, db_engine):
    with Session(db_engine) as db:
        users = [User(login=f"hints_{i}", email=f"hints_{i}@example.com", role=role,
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
    path = f'/teacher/tasks/{task["id"]}/hints'
    items = []
    for case in [{"title": "Direction", "content": "Think"}, {"title": "Loop", "content": "Use for"}, {"title": "Detail", "content": "Sum values"}]:
        response = client.post(path, json=case)
        assert response.status_code == 201, response.text
        items.append(response.json())
    assert [t['position'] for t in items] == [1, 2, 3]
    test_id = items[0]['id']
    assert client.patch(f'{path}/{test_id}', json={"content": "Updated"}).json()['content'] == 'Updated'
    assert client.patch(f'{path}/{test_id}', json={"title": " "}).status_code == 422
    reverse = [t['id'] for t in reversed(items)]
    assert client.patch(path + '/reorder', json={"hint_ids": reverse}).status_code == 200
    assert [t['id'] for t in client.get(path).json()] == reverse
    for invalid in [reverse[:-1], [test_id] * 3, reverse + [999999]]:
        assert client.patch(path + '/reorder', json={"hint_ids": invalid}).status_code == 422
    assert client.delete(f'{path}/{test_id}').status_code == 204
    assert [t['position'] for t in client.get(path).json()] == [1, 2]
    remaining = client.get(path).json()[0]['id']
    for index, status in [(1, 404), (2, 403)]:
        auth(index)
        assert client.get(path).status_code == status
        assert client.post(path, json={"title": "x", "content": "y"}).status_code == status
        assert client.patch(f'{path}/{remaining}', json={"title": "x"}).status_code == status
        assert client.delete(f'{path}/{remaining}').status_code == status
        assert client.patch(path + '/reorder', json={"hint_ids": []}).status_code == status
    auth(0)
    assert client.patch(f'/teacher/tasks/{task["id"]}/archive').status_code == 200
    assert client.get(path).status_code == 200
    assert client.post(path, json={"title": "x", "content": "y"}).status_code == 409
    assert client.patch(f'{path}/{remaining}', json={"title": "x"}).status_code == 409
    assert client.delete(f'{path}/{remaining}').status_code == 409
    assert client.patch(path + '/reorder', json={"hint_ids": []}).status_code == 409
