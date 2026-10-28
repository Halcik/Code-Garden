from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.api.student import get_judge0_service
from app.main import app
from test_execution_integration import actors, create, login


@pytest.mark.parametrize("state", ["READY", "DRAFT", "archived"])
def test_check_visibility_and_teacher_reorder(client, actors, state):
    login(client, actors, "TEACHER")
    task = create(client)
    base = f"/teacher/tasks/{task['id']}"
    ids = []
    for name, hidden in [("first", False), ("SECRET name", True)]:
        response = client.post(base + "/tests", json={"name": name, "test_type": "INPUT_OUTPUT",
            "config": {"input_data": name, "expected_output": name}, "is_hidden": hidden})
        assert response.status_code == 201
        ids.append(response.json()["id"])
    assert client.patch(base + "/tests/reorder", json={"test_ids": ids[::-1]}).status_code == 200
    if state == "DRAFT":
        assert client.patch(base, json={"status": "DRAFT"}).status_code == 200
    elif state == "archived":
        assert client.patch(base + "/archive").status_code == 200
    runner = SimpleNamespace(execution_deadline=lambda cpu: 10,
        run_code=AsyncMock(side_effect=[{"status": "completed", "stdout": "SECRET name"}, {"status": "completed", "stdout": "first"}]))
    app.dependency_overrides[get_judge0_service] = lambda: runner
    try:
        login(client, actors, "STUDENT")
        response = client.post(f"/student/tasks/{task['id']}/check", json={"source_code": "print(input())"})
        if state != "READY":
            assert response.status_code == 404
            runner.run_code.assert_not_called()
        else:
            assert response.status_code == 200
            data = response.json()
            assert data["all_passed"] and data["passed"] == data["total"] == 2
            assert [r["is_public"] for r in data["results"]] == [False, True]
            assert [call.kwargs["stdin"] for call in runner.run_code.await_args_list] == ["SECRET name", "first"]
            assert "SECRET" not in response.text
    finally:
        app.dependency_overrides.pop(get_judge0_service, None)
