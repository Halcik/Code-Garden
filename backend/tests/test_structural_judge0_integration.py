"""Opt-in real Judge0 check; never runs student code on the host."""
import asyncio
import os
from types import SimpleNamespace

import httpx
import pytest

from app.core.config import Settings
from app.services.judge0 import Judge0Service
from app.services.solution_check import check_solution


@pytest.mark.parametrize("version", ["3.11", "3.12", "3.13", "3.14"])
def test_structural_grammar_in_real_task_interpreter(version):
    url = os.environ.get("TEST_JUDGE0_URL")
    if not url:
        pytest.skip("Set TEST_JUDGE0_URL to a running self-hosted Judge0")
    languages = httpx.get(url.rstrip("/") + "/languages", timeout=10).raise_for_status().json()
    language_id = next(row["id"] for row in languages if row["name"].startswith(f"Python {version} "))
    settings = Settings(database_url="postgresql+psycopg://unused:unused@localhost/unused",
                        jwt_secret="test-only-structural-judge0-" + "x" * 40,
                        judge0_url=url, judge0_python_languages={version: language_id})
    service = Judge0Service(settings)
    task = SimpleNamespace(python_version=version, time_limit_seconds=2, memory_limit_mb=256)
    # If executed, this source immediately raises. Only the 3.14 parser accepts
    # its t-string syntax; even undefined interpolation expressions stay unevaluated.
    source = 'raise RuntimeError("must not execute")\ndef render():\n    return t"Hello {undefined_name()}"\n'
    tests = [SimpleNamespace(name="SECRET rule", test_type="STRUCTURAL",
                            config={"rule_type": "FUNCTION_EXISTS", "expected_value": "render"},
                            is_hidden=True, position=1)]
    result = asyncio.run(check_solution(task, tests, source, service))
    assert result.all_passed == (version == "3.14")
    assert "SECRET" not in result.model_dump_json(exclude_none=True)
    assert result.results[0].details is None
