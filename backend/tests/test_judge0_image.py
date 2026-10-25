"""Image tooling tests: HTTP is mocked, no Docker daemon/real Judge0 needed."""
import base64
import importlib.util
import json
from pathlib import Path
import re

import httpx
import pytest


ROOT = Path(__file__).resolve().parents[1] / "judge0"
spec = importlib.util.spec_from_file_location("judge0_smoke", ROOT / "smoke_test.py")
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


def catalog():
    # Deliberately non-sequential IDs: application mapping must come from the API.
    return [{"id": 700 + index * 9, "name": f"Python {row['series']} (CPython {row['version']})"}
            for index, row in enumerate(smoke.VERSIONS)]


def test_sources_are_pinned_and_cover_all_requested_series():
    assert [row["series"] for row in smoke.VERSIONS] == ["3.11", "3.12", "3.13", "3.14"]
    for row in smoke.VERSIONS:
        assert re.fullmatch(re.escape(row["series"]) + r"\.\d+", row["version"])
        assert re.fullmatch(r"[0-9a-f]{64}", row["sha256"])
    dockerfile = (ROOT / "Dockerfile").read_text()
    assert "judge0/judge0:1.13.1@sha256:" in dockerfile
    for row in smoke.VERSIONS:
        assert f"/usr/local/code-garden/python-{row['series']}" in dockerfile
    assert ".env" not in (ROOT / ".dockerignore").read_text().splitlines()[1:]


def test_discovery_uses_actual_distinct_api_ids():
    assert smoke.discover(catalog()) == {"3.11": 700, "3.12": 709, "3.13": 718, "3.14": 727}


@pytest.mark.parametrize("kind", ["missing", "duplicate", "wrong_version", "duplicate_id"])
def test_discovery_refuses_unavailable_or_ambiguous_environment(kind):
    languages = catalog()
    if kind == "missing":
        languages.pop()
    elif kind == "duplicate":
        languages.append(languages[0])
    elif kind == "wrong_version":
        languages[0]["name"] = "Python (3.8.1)"
    else:
        languages[0]["id"] = languages[1]["id"]
    with pytest.raises(ValueError):
        smoke.discover(languages)


def test_smoke_submits_every_exact_interpreter_with_limits(monkeypatch):
    monkeypatch.setattr(smoke.time, "sleep", lambda _: None)
    requests = []
    polls = {}
    def handler(request):
        if request.method == "POST":
            data = json.loads(request.content)
            python = next(row for row, language in zip(smoke.VERSIONS, catalog()) if language["id"] == data["language_id"])
            source = base64.b64decode(data["source_code"]).decode()
            assert f"python-{python['series']}/bin/python{python['series']}" in source
            assert "assert sys.version_info[:3] ==" in source
            assert data["enable_network"] is False
            assert data["cpu_time_limit"] == 2 and data["memory_limit"] == 262144
            assert data["wall_time_limit"] == 5
            requests.append(python)
            return httpx.Response(201, json={"token": python["series"]})
        series = request.url.path.rsplit("/", 1)[-1]
        assert "exit_code" in request.url.params["fields"]
        polls[series] = polls.get(series, 0) + 1
        python = next(row for row in smoke.VERSIONS if row["series"] == series)
        return httpx.Response(200, json={"status": {"id": 1 if polls[series] == 1 else 3}, "exit_code": 0,
            "stdout": base64.b64encode(f"{python['version']} (test build)\n".encode()).decode()})
    with httpx.Client(base_url="http://judge0", transport=httpx.MockTransport(handler)) as client:
        result = smoke.smoke(client, smoke.discover(catalog()))
    assert len(result) == len(requests) == 4
    assert all(count == 2 for count in polls.values())


def test_smoke_refuses_mislabeled_interpreter():
    def handler(request):
        return httpx.Response(201, json={"token": "abc"}) if request.method == "POST" else httpx.Response(200,
            json={"status": {"id": 3}, "exit_code": 0, "stdout": base64.b64encode(b"3.8.1 (wrong)\n").decode()})
    with httpx.Client(base_url="http://judge0", transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(RuntimeError, match="smoke failed"):
            smoke.smoke(client, smoke.discover(catalog()))


def test_env_update_preserves_unrelated_configuration_and_removes_duplicates(tmp_path):
    path = tmp_path / ".env"
    path.write_text('JWT_SECRET=local-secret\n# comment\nJUDGE0_URL=old\nJUDGE0_URL=duplicate\n')
    mapping = 'JUDGE0_PYTHON_LANGUAGES={"3.13":999}'
    smoke.update_env(path, "http://localhost:2358", mapping)
    assert path.read_text() == f'JWT_SECRET=local-secret\n# comment\nJUDGE0_URL=http://localhost:2358\n{mapping}\n'


def test_failed_smoke_never_writes_backend_env(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    path.write_text("JUDGE0_PYTHON_LANGUAGES={}\n")
    client = httpx.Client(base_url="http://judge0", transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json=catalog())))
    monkeypatch.setattr(smoke.httpx, "Client", lambda **kwargs: client)
    def fail(*args):
        raise RuntimeError("wrong interpreter")
    monkeypatch.setattr(smoke, "smoke", fail)
    monkeypatch.setattr("sys.argv", ["smoke_test.py", "--write-env", str(path)])
    with pytest.raises(SystemExit) as error:
        smoke.main()
    assert error.value.code == 1
    assert path.read_text() == "JUDGE0_PYTHON_LANGUAGES={}\n"


def test_polling_has_deadline():
    with httpx.Client(base_url="http://judge0", transport=httpx.MockTransport(
            lambda request: httpx.Response(201, json={"token": "abc"}))) as client:
        with pytest.raises(TimeoutError):
            smoke.submission(client, 90, "print(1)", deadline_seconds=-1)


@pytest.mark.parametrize("exists", [False, True])
def test_initialization_preserves_config_or_creates_distinct_passwords_with_lf(tmp_path, monkeypatch, exists):
    init_spec = importlib.util.spec_from_file_location("judge0_init", ROOT / "init_env.py")
    init = importlib.util.module_from_spec(init_spec)
    init_spec.loader.exec_module(init)
    monkeypatch.setattr(init, "__file__", str(tmp_path / "init_env.py"))
    (tmp_path / ".env.example").write_bytes(b"POSTGRES_PASSWORD=\r\nREDIS_PASSWORD=\r\nENABLE_NETWORK=false\r\n")
    path = tmp_path / ".env"
    if exists:
        path.write_bytes(b"existing-secret\r\n")
    init.main()
    if exists:
        assert path.read_bytes() == b"existing-secret\r\n"
    else:
        assert b"\r" not in path.read_bytes()
        data = dict(line.split("=", 1) for line in path.read_text().splitlines())
        assert len(data["POSTGRES_PASSWORD"]) == len(data["REDIS_PASSWORD"]) == 64
        assert data["POSTGRES_PASSWORD"] != data["REDIS_PASSWORD"]
        assert data["ENABLE_NETWORK"] == "false"
