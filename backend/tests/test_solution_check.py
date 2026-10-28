import asyncio
import base64
import io
import json
import zipfile
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from app.schemas.execution import RunResponse
from app.services.judge0 import Judge0Error, Judge0Service
from app.services.solution_check import check_solution
from app.services.structural_runner import analyze_structure
from test_execution import endpoint, settings


def item(kind="INPUT_OUTPUT", config=None, hidden=False, position=1):
    return SimpleNamespace(name="SECRET name" if hidden else "Example", test_type=kind,
        config=config or {"input_data": "SECRET input", "expected_output": "SECRET expected"},
        is_hidden=hidden, position=position)


def service(*outputs):
    return SimpleNamespace(execution_deadline=lambda cpu: max(10, cpu + 8),
        run_code=AsyncMock(side_effect=[RunResponse(**output) for output in outputs]))


def check(tests, runner, source="print(1)"):
    task = SimpleNamespace(python_version="3.13", time_limit_seconds=15, memory_limit_mb=128)
    return asyncio.run(check_solution(task, tests, source, runner))


@pytest.mark.parametrize("stdout,expected", [("ok", True), ("ok\n", True), ("ok\r\n\n", True), (" ok", False), ("ok \n", False), ("wrong", False)])
def test_exact_normalization(stdout, expected):
    result = check([item(config={"input_data": "hi", "expected_output": "ok"})], service({"status": "completed", "stdout": stdout}))
    assert (result.passed == 1) == expected
    assert result.all_passed == expected
    assert result.results[0].details.actual_output == stdout


def test_all_tests_run_in_stored_order_and_use_task_limits():
    runner = service({"status": "execution_error", "stderr": "ValueError: bad"},
                     {"status": "time_limit_exceeded"}, {"status": "completed", "stdout": "ok"})
    tests = [item(config={"input_data": str(i), "expected_output": "ok"}, position=i) for i in (2, 5, 8)]
    result = check(tests, runner)
    assert (result.passed, result.total, result.all_passed) == (1, 3, False)
    assert [r.position for r in result.results] == [2, 5, 8]
    for call, i in zip(runner.run_code.await_args_list, (2, 5, 8)):
        assert call.kwargs == dict(source_code="print(1)", stdin=str(i), python_version="3.13", time_limit_seconds=15, memory_limit_mb=128)
    assert result.results[0].details.execution.stderr == "ValueError: bad"
    assert result.results[1].details.execution.status == "time_limit_exceeded"


@pytest.mark.parametrize("status", ["completed", "execution_error", "time_limit_exceeded"])
def test_hidden_output_and_diagnostics_never_serialized(status):
    result = check([item(hidden=True)], service({"status": status, "stdout": "SECRET input", "stderr": "SECRET traceback", "time": 1.23}))
    data = result.model_dump(exclude_none=True)
    assert data["results"][0] == dict(number=1, position=1, test_type="INPUT_OUTPUT", is_public=False, status="failed")
    assert "SECRET" not in json.dumps(data)


@pytest.mark.parametrize("rule,value,source", [
    ("FUNCTION_EXISTS", "f", "def f(): pass"), ("CLASS_EXISTS", "C", "class C: pass"),
    ("CALLS_FUNCTION", "math.sqrt", "math.sqrt(4)"), ("USES_FOR", None, "for i in []: pass"),
    ("USES_WHILE", None, "while False: pass"), ("USES_IF", None, "if True: pass"),
])
def test_structural_ast_pass_fail(rule, value, source):
    runner = service()
    runner.run_code.side_effect = lambda **kwargs: RunResponse(status="completed", stdout=json.dumps(analyze_structure(kwargs["stdin"])))
    config = {"rule_type": rule, "expected_value": value}
    assert check([item("STRUCTURAL", config)], runner, source).all_passed
    assert not check([item("STRUCTURAL", config)], runner, "# " + source.replace("\n", " ")).all_passed
    assert runner.run_code.await_count == 2


@pytest.mark.parametrize("hidden", [False, True])
def test_structural_syntax_error_and_hidden_rule(hidden):
    runner = service({"status": "completed", "stdout": json.dumps(analyze_structure("def broken(:"))})
    result = check([item("STRUCTURAL", {"rule_type": "FUNCTION_EXISTS", "expected_value": "SECRET"}, hidden)], runner, "def broken(:")
    assert result.passed == 0
    if hidden:
        assert "SECRET" not in result.model_dump_json(exclude_none=True)
    else:
        assert "składnię" in result.results[0].details.message


@pytest.mark.parametrize("actual,expected,passed", [(5, 5, True), (4, 5, False), (True, 1, False), ([True], [1], False), (None, None, True), ([1, {"a": 2}], [1, {"a": 2}], True)])
@pytest.mark.parametrize("hidden", [False, True])
def test_function_protocol_and_no_expected_value_in_sandbox(actual, expected, passed, hidden):
    async def run_code(**kwargs):
        archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(kwargs["additional_files"])))
        assert archive.namelist() == ["solution.py"]
        assert archive.read("solution.py").decode() == "def f(x): return x"
        assert json.loads(kwargs["stdin"]) == ["f", ["SECRET argument"]]
        assert "expected_result" not in kwargs["source_code"]
        # Recover only the per-invocation protocol marker from the generated runner.
        import ast
        tree = ast.parse(kwargs["source_code"])
        marker = next(n.value for n in ast.walk(tree) if isinstance(n, ast.Constant) and isinstance(n.value, str) and len(n.value) == 48)
        return RunResponse(status="completed", stdout="student output\n" + marker + json.dumps(actual) + "\n")
    runner = service()
    runner.run_code = AsyncMock(side_effect=run_code)
    result = check([item("FUNCTION", {"function_name": "f", "arguments": ["SECRET argument"], "expected_result": expected}, hidden)], runner, "def f(x): return x")
    assert result.all_passed == passed
    if hidden:
        assert "SECRET" not in result.model_dump_json(exclude_none=True)
        assert result.results[0].details is None


def test_function_invalid_protocol_is_failed_not_infrastructure():
    result = check([item("FUNCTION", {"function_name": "f", "arguments": [], "expected_result": 1})], service({"status": "completed", "stdout": "not a result"}))
    assert result.passed == 0
    assert result.results[0].details.message


def test_empty_suite_is_not_success():
    result = check([], service())
    assert (result.total, result.passed, result.all_passed) == (0, 0, False)


@pytest.mark.parametrize("code", [502, 503, 504])
def test_infrastructure_failure_aborts_without_misleading_summary(code):
    runner = service()
    runner.run_code.side_effect = Judge0Error(code, "technical")
    with pytest.raises(Judge0Error) as error:
        check([item()], runner)
    assert error.value.status_code == code


def test_suite_deadline_is_bounded_and_scales_with_tests(monkeypatch):
    from contextlib import asynccontextmanager
    budgets = []
    @asynccontextmanager
    async def timeout(seconds):
        budgets.append(seconds)
        yield
    monkeypatch.setattr(asyncio, "timeout", timeout)
    for count in (1, 3, 20):
        check([item()] * count, service(*[{"status": "completed"}] * count))
    assert budgets == [28, 74, 300]


def test_suite_timeout_is_technical():
    runner = service()
    runner.run_code.side_effect = TimeoutError
    with pytest.raises(Judge0Error) as error:
        check([item()], runner)
    assert error.value.status_code == 504


@pytest.mark.parametrize("version", ["3.11", "3.12", "3.13", "3.14"])
def test_structural_parser_uses_task_interpreter_and_never_backend_ast(version, monkeypatch):
    import ast
    source = 'def render():\n    return t"Hello {name}"\n'
    facts = dict(syntax_valid=version == "3.14", functions=["render"] if version == "3.14" else [],
                 classes=[], calls=[], uses_for=False, uses_while=False, uses_if=False)
    runner = service({"status": "completed", "stdout": json.dumps(facts)})
    task = SimpleNamespace(python_version=version, time_limit_seconds=15, memory_limit_mb=128)
    # Backend 3.13 cannot parse this syntax. It must never attempt to do so.
    monkeypatch.setattr(ast, "parse", lambda *a, **kw: pytest.fail("Backend must not parse student code"))
    result = asyncio.run(check_solution(task, [item("STRUCTURAL", {"rule_type": "FUNCTION_EXISTS", "expected_value": "render"})], source, runner))
    assert result.all_passed == (version == "3.14")
    kwargs = runner.run_code.await_args.kwargs
    assert kwargs["python_version"] == version
    assert kwargs["stdin"] == source
    assert kwargs["time_limit_seconds"] == 15 and kwargs["memory_limit_mb"] == 128
    assert "ast.parse(source)" in kwargs["source_code"]
    assert source not in kwargs["source_code"]


def test_structural_analysis_cached_at_first_structural_test_and_budgeted(monkeypatch):
    from contextlib import asynccontextmanager
    facts = analyze_structure("def f(): pass")
    runner = service({"status": "completed", "stdout": "ok"},
                     {"status": "completed", "stdout": json.dumps(facts)},
                     {"status": "completed", "stdout": "ok"})
    budgets = []
    @asynccontextmanager
    async def timeout(seconds):
        budgets.append(seconds)
        yield
    monkeypatch.setattr(asyncio, "timeout", timeout)
    tests = [item(config={"input_data": "first", "expected_output": "ok"}),
             item("STRUCTURAL", {"rule_type": "FUNCTION_EXISTS", "expected_value": "f"}),
             item("STRUCTURAL", {"rule_type": "CLASS_EXISTS", "expected_value": "SECRET"}, hidden=True),
             item(config={"input_data": "last", "expected_output": "ok"})]
    result = check(tests, runner, "def f(): pass")
    assert [call.kwargs["stdin"] for call in runner.run_code.await_args_list] == ["first", "def f(): pass", "last"]
    assert budgets == [74]  # Two executions plus one shared AST analysis.
    assert (result.passed, result.total) == (3, 4)
    assert "SECRET" not in result.model_dump_json(exclude_none=True)


@pytest.mark.parametrize("output,code", [
    ({"status": "execution_error", "stderr": "SECRET diagnostics"}, 502),
    ({"status": "time_limit_exceeded"}, 504),
    ({"status": "completed", "stdout": "not JSON"}, 502),
    ({"status": "completed", "stdout": "{}"}, 502),
    ({"status": "completed", "stdout": '{"syntax_valid": "true"}'}, 502),
])
def test_structural_analyzer_failure_is_technical_not_student_failure(output, code):
    with pytest.raises(Judge0Error) as error:
        check([item("STRUCTURAL", {"rule_type": "USES_FOR"}, hidden=True)], service(output))
    assert error.value.status_code == code
    assert "SECRET" not in error.value.message


def prepare_endpoint(endpoint):
    client, user, db, runner = endpoint
    db.scalars = lambda query: [item(config={"input_data": "hi", "expected_output": "hello"}), item(hidden=True)]
    runner.execution_deadline = lambda cpu: 10
    return client, user, db, runner


def test_check_endpoint_public_hidden_and_summary(endpoint):
    client, _, db, runner = prepare_endpoint(endpoint)
    def scalars(query):
        assert "ORDER BY task_tests.position, task_tests.id" in str(query)
        return [item(config={"input_data": "hi", "expected_output": "hello"}), item(hidden=True)]
    db.scalars = scalars
    response = client.post("/student/tasks/7/check", json={"source_code": "print(1)"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    data = response.json()
    assert (data["passed"], data["total"], data["all_passed"]) == (1, 2, False)
    assert data["results"][0]["details"]["config"]["input_data"] == "hi"
    assert "details" not in data["results"][1]
    assert "SECRET" not in response.text


@pytest.mark.parametrize("role", ["TEACHER", "ADMIN"])
def test_check_student_role_only(endpoint, role):
    from app.models.user import UserRole
    client, user, _, runner = prepare_endpoint(endpoint)
    user.role = UserRole(role)
    assert client.post("/student/tasks/7/check", json={"source_code": "x"}).status_code == 403
    runner.run_code.assert_not_called()


def test_check_visibility_uses_catalog_filters(endpoint):
    client, _, db, runner = prepare_endpoint(endpoint)
    def scalar(query):
        assert "tasks.status =" in str(query) and "tasks.is_archived IS false" in str(query)
        return None
    db.scalar = scalar
    assert client.post("/student/tasks/7/check", json={"source_code": "x"}).status_code == 404
    runner.run_code.assert_not_called()


@pytest.mark.parametrize("extra", [{"stdin": "x"}, {"tests": []}, {"expected_output": "x"}, {"source_code": "ą" * 51201}])
def test_check_request_does_not_accept_tests_or_oversized_code(endpoint, extra):
    client, _, _, runner = prepare_endpoint(endpoint)
    assert client.post("/student/tasks/7/check", json={"source_code": "x", **extra}).status_code == 422
    runner.run_code.assert_not_called()


@pytest.mark.parametrize("code", [503, 504])
def test_check_endpoint_infrastructure_errors(endpoint, code):
    client, _, _, runner = prepare_endpoint(endpoint)
    runner.run_code.side_effect = Judge0Error(code, "Technical failure")
    response = client.post("/student/tasks/7/check", json={"source_code": "x"})
    assert response.status_code == code
    assert "passed" not in response.json()


def test_function_archive_sent_using_existing_judge0_limits():
    def handler(request):
        if request.url.path == "/languages":
            return httpx.Response(200, json=[{"id": 13, "name": "Python 3.13"}])
        if request.method == "POST":
            payload = json.loads(request.content)
            assert payload["enable_network"] is False
            assert payload["cpu_time_limit"] == 15
            assert payload["wall_time_limit"] == 18
            assert payload["memory_limit"] == 128 * 1024
            assert zipfile.ZipFile(io.BytesIO(base64.b64decode(payload["additional_files"]))).read("solution.py") == b"print(1)"
            return httpx.Response(201, json={"token": "abc"})
        return httpx.Response(200, json={"status": {"id": 5}})
    runner = Judge0Service(settings(), httpx.MockTransport(handler))
    result = check([item("FUNCTION", {"function_name": "f", "arguments": [], "expected_result": 1})], runner)
    assert result.results[0].details.execution.status == "time_limit_exceeded"
