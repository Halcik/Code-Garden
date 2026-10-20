import asyncio
import base64
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.schemas.execution import RunRequest
from app.services.judge0 import Judge0Error, Judge0Service


def settings(**kwargs):
    return Settings(database_url="postgresql+psycopg://x:x@localhost/x", jwt_secret="x" * 40,
                    judge0_python_languages={"3.11": 11, "3.12": 12, "3.13": 13, "3.14": 14},
                    judge0_poll_interval_ms=1, **kwargs)


def run(service, version="3.13"):
    return asyncio.run(service.run_code(source_code="print(input())", stdin="hello", python_version=version,
                                       time_limit_seconds=2.5, memory_limit_mb=128))


@pytest.mark.parametrize("version", ["3.11", "3.12", "3.13", "3.14"])
def test_mapping_payload_polling_and_normalization(version):
    polls = []
    def handler(request):
        if request.url.path == "/languages":
            return httpx.Response(200, json=[{"id": int(version[-2:]), "name": f"Python ({version}.0)"}])
        if request.method == "POST":
            data = json.loads(request.content)
            assert data["language_id"] == int(version[-2:])
            assert data["cpu_time_limit"] == 2.5
            assert data["memory_limit"] == 128 * 1024
            assert data["wall_time_limit"] > 2.5
            assert data["enable_network"] is False
            assert base64.b64decode(data["source_code"]) == b"print(input())"
            assert base64.b64decode(data["stdin"]) == b"hello"
            return httpx.Response(201, json={"token": "temporary-token"})
        polls.append(1)
        return httpx.Response(200, json={"status": {"id": min(len(polls), 3)},
            "stdout": "aGVsbG8K", "exit_code": 0, "time": "0.02", "memory": 8192, "token": "secret"})
    result = run(Judge0Service(settings(), httpx.MockTransport(handler)), version)
    assert len(polls) == 3
    assert result.stdout == "hello\n"
    assert result.time == .02 and result.memory == 8192
    assert "token" not in result.model_dump()


@pytest.mark.parametrize("field", ["source_code", "stdin"])
@pytest.mark.parametrize("value", ["a" * 102401, "ą" * 51201], ids=["ascii", "utf8"])
def test_input_byte_limits(field, value):
    with pytest.raises(ValidationError):
        RunRequest(**{"source_code": "print(1)", field: value})


@pytest.mark.parametrize("extra", ["python_version", "language_id", "time_limit_seconds", "memory_limit_mb"])
def test_cannot_override_settings(extra):
    with pytest.raises(ValidationError):
        RunRequest(source_code="print(1)", **{extra: 1})


@pytest.mark.parametrize("mode,code", [("unavailable",503), ("http_timeout",503), ("no_token",502), ("invalid",502), ("missing_language",503), ("wrong_version",503), ("poll_timeout",504), ("internal",502)])
def test_infrastructure_failures(mode, code):
    def handler(request):
        if mode == "unavailable":
            return httpx.Response(503)
        if mode == "http_timeout":
            raise httpx.ConnectTimeout("timeout")
        if mode == "invalid":
            return httpx.Response(200, text="invalid")
        if request.url.path == "/languages":
            return httpx.Response(200, json=[] if mode == "missing_language" else [{"id": 13, "name": "Python (3.12.0)" if mode == "wrong_version" else "Python (3.13.0)"}])
        if request.method == "POST":
            return httpx.Response(201, json={} if mode == "no_token" else {"token": "abc"})
        return httpx.Response(200, json={"status": {"id": 13 if mode == "internal" else 1}})
    with pytest.raises(Judge0Error) as error:
        run(Judge0Service(settings(judge0_max_wait_seconds=.03), httpx.MockTransport(handler)))
    assert error.value.status_code == code


def test_unconfigured_version():
    with pytest.raises(Judge0Error) as error:
        run(Judge0Service(settings()), "3.99")
    assert error.value.status_code == 503


@pytest.fixture
def endpoint():
    from app.main import app
    from app.api.dependencies import get_current_user
    from app.api.student import get_judge0_service
    from app.db.session import get_db
    from app.models.user import UserRole, AccountStatus, TeacherApproval
    user = SimpleNamespace(role=UserRole.STUDENT, status=AccountStatus.ACTIVE, teacher_approval=TeacherApproval.APPROVED)
    task = SimpleNamespace(python_version="3.12", time_limit_seconds=3, memory_limit_mb=64)
    db = SimpleNamespace(scalar=lambda query: task)
    service = SimpleNamespace(run_code=AsyncMock(return_value={"status": "completed", "stdout": "hello"}))
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_judge0_service] = lambda: service
    with TestClient(app) as client:
        yield client, user, db, service
    app.dependency_overrides.clear()


def test_student_endpoint(endpoint):
    client, _, _, service = endpoint
    response = client.post("/student/tasks/7/run", json={"source_code": "print(1)", "stdin": "hi"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    service.run_code.assert_awaited_once_with(source_code="print(1)", stdin="hi", python_version="3.12", time_limit_seconds=3, memory_limit_mb=64)
    assert "token" not in response.json()


@pytest.mark.parametrize("role", ["TEACHER", "ADMIN"])
def test_other_roles_forbidden(endpoint, role):
    from app.models.user import UserRole
    client, user, _, service = endpoint
    user.role = UserRole(role)
    assert client.post("/student/tasks/7/run", json={"source_code": "x"}).status_code == 403
    service.run_code.assert_not_called()


def test_unavailable_task_uses_existing_filters(endpoint):
    client, _, db, service = endpoint
    def scalar(query):
        sql = str(query)
        assert "tasks.status =" in sql and "tasks.is_archived IS false" in sql
        return None
    db.scalar = scalar
    assert client.post("/student/tasks/7/run", json={"source_code": "x"}).status_code == 404
    service.run_code.assert_not_called()


def test_endpoint_service_failure(endpoint):
    client, _, _, service = endpoint
    service.run_code.side_effect = Judge0Error(504, "Timed out waiting for Judge0")
    assert client.post("/student/tasks/7/run", json={"source_code": "x"}).status_code == 504


@pytest.mark.parametrize("field", ["source_code", "stdin"])
def test_endpoint_rejects_oversized_inputs(endpoint, field):
    client, _, _, service = endpoint
    response = client.post("/student/tasks/7/run", json={"source_code": "x", field: "a" * 102401})
    assert response.status_code == 422
    service.run_code.assert_not_called()


@pytest.mark.parametrize("value", [0, -1, float("inf"), float("nan")])
def test_task_cpu_validation(value):
    from app.schemas.task import TaskUpdate
    with pytest.raises(ValidationError):
        TaskUpdate(time_limit_seconds=value)


def test_task_execution_settings_cannot_be_null_or_raw_language_id():
    from app.schemas.task import TaskUpdate
    for field in ("python_version", "time_limit_seconds", "memory_limit_mb", "language_id"):
        with pytest.raises(ValidationError):
            TaskUpdate(**{field: None})
