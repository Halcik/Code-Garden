"""Evaluate stored KAN-27 definitions. Student code runs only inside Judge0."""
import ast
import asyncio
import base64
import io
import json
import secrets
import zipfile

from app.schemas.execution import RunResponse
from app.schemas.solution_check import CheckResponse, PublicTestDetails, TestResult
from app.schemas.task_test import TaskTestWrite
from app.services.judge0 import Judge0Error


def normalize_output(value: str) -> str:
    # Preserve spaces and internal blank lines. Only platform line endings and
    # trailing newlines differ from a teacher's single-line expected output.
    return value.replace("\r\n", "\n").rstrip("\n")


def json_equal(actual, expected):
    # JSON booleans are not numbers (Python otherwise considers True == 1).
    if isinstance(actual, bool) or isinstance(expected, bool):
        return type(actual) is type(expected) and actual == expected
    if isinstance(actual, list) and isinstance(expected, list):
        return len(actual) == len(expected) and all(json_equal(a, b) for a, b in zip(actual, expected))
    if isinstance(actual, dict) and isinstance(expected, dict):
        return actual.keys() == expected.keys() and all(json_equal(actual[key], expected[key]) for key in actual)
    return actual == expected


def invalid_constant(value):
    raise ValueError("Non-finite JSON value")


def structural_passes(tree, config):
    rule, value = config["rule_type"], config.get("expected_value")
    for node in ast.walk(tree):
        if rule == "FUNCTION_EXISTS" and isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == value:
            return True
        if rule == "CLASS_EXISTS" and isinstance(node, ast.ClassDef) and node.name == value:
            return True
        if rule == "CALLS_FUNCTION" and isinstance(node, ast.Call):
            parts = []
            target = node.func
            while isinstance(target, ast.Attribute):
                parts.append(target.attr)
                target = target.value
            if isinstance(target, ast.Name) and ".".join([target.id, *reversed(parts)]) == value:
                return True
        if any(rule == name and isinstance(node, kind) for name, kind in (
            ("USES_FOR", (ast.For, ast.AsyncFor)), ("USES_WHILE", ast.While), ("USES_IF", ast.If)
        )):
            return True
    return False


def function_submission(source, config, marker):
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as files:
        files.writestr("solution.py", source)
    # No expected value or other test definition is shipped to the sandbox.
    # Arguments for this one invocation are necessarily available to the program.
    runner = f'''import json, runpy, sys
def _check():
    loads, dumps = json.loads, json.dumps
    output = sys.stdout
    name, arguments = loads(sys.stdin.read())
    namespace = runpy.run_path("solution.py", run_name="__student__")
    result = namespace[name](*arguments)
    output.write("\\n" + {marker!r} + dumps(result, allow_nan=False) + "\\n")
_check()
'''
    return dict(source_code=runner, stdin=json.dumps([config["function_name"], config["arguments"]]),
                additional_files=base64.b64encode(archive.getvalue()).decode())


async def check_solution(task, tests, source, service):
    # Validate stored definitions before any execution; malformed teacher data is
    # an infrastructure/configuration error, never a failed student solution.
    try:
        definitions = [(item, TaskTestWrite.model_validate(dict(name=item.name, test_type=item.test_type,
                        config=item.config, is_hidden=item.is_hidden))) for item in tests]
    except ValueError:
        raise Judge0Error(503, "Invalid stored test configuration") from None
    results = []
    tree = None
    syntax_error = None
    if any(definition.test_type == "STRUCTURAL" for _, definition in definitions):
        try:
            tree = ast.parse(source)
        except (SyntaxError, ValueError, RecursionError):
            syntax_error = "Nie można przeanalizować struktury kodu. Sprawdź składnię Pythona."
    executions = sum(definition.test_type != "STRUCTURAL" for _, definition in definitions)
    # Sequential execution respects teacher order. The outer deadline covers the
    # full per-test wall/queue budget, capped at five minutes for the whole check.
    budget = min(300, 5 + executions * service.execution_deadline(task.time_limit_seconds))
    try:
        async with asyncio.timeout(budget):
            for number, (item, definition) in enumerate(definitions, 1):
                config = definition.config
                details = PublicTestDetails(name=definition.name, config=config) if not definition.is_hidden else None
                passed = False
                if definition.test_type == "STRUCTURAL":
                    passed = tree is not None and structural_passes(tree, config)
                    if details:
                        details.message = syntax_error
                else:
                    marker = secrets.token_hex(24)
                    submission = (function_submission(source, config, marker) if definition.test_type == "FUNCTION"
                                  else dict(source_code=source, stdin=config["input_data"]))
                    execution = RunResponse.model_validate(await service.run_code(**submission,
                        python_version=task.python_version, time_limit_seconds=task.time_limit_seconds,
                        memory_limit_mb=task.memory_limit_mb))
                    if definition.test_type == "INPUT_OUTPUT":
                        passed = execution.status == "completed" and normalize_output(execution.stdout or "") == normalize_output(config["expected_output"])
                        if details:
                            details.actual_output = execution.stdout or ""
                            details.execution = execution
                    else:
                        if execution.status == "completed":
                            try:
                                encoded = (execution.stdout or "").rsplit("\n" + marker, 1)[1]
                                actual = json.loads(encoded, parse_constant=invalid_constant)
                                passed = json_equal(actual, config["expected_result"])
                                if details:
                                    details.actual_result = actual
                                    details.has_actual_result = True
                            except (IndexError, ValueError, RecursionError):
                                if details:
                                    details.message = "Funkcja nie zwróciła poprawnej wartości JSON."
                        if details:
                            # Only public arguments exist in this sandbox. Do not
                            # display protocol output as the student's stdout.
                            details.execution = execution.model_copy(update={"stdout": None})
                results.append(TestResult(number=number, position=item.position, test_type=definition.test_type,
                    is_public=not definition.is_hidden, status="passed" if passed else "failed", details=details))
    except TimeoutError:
        raise Judge0Error(504, "Timed out checking solution") from None
    passed_count = sum(result.status == "passed" for result in results)
    return CheckResponse(passed=passed_count, total=len(results), all_passed=bool(results) and passed_count == len(results), results=results)
