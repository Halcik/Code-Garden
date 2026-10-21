"""HTTP-only checks against the self-hosted Judge0; never executes local code.

Run from repo root: backend/.venv/Scripts/python.exe backend/judge0/smoke_test.py
"""
import argparse
import base64
import json
from pathlib import Path
import time

import httpx


VERSIONS = json.loads(Path(__file__).with_name("versions.json").read_text(encoding="utf-8"))


def discover(languages: list[dict]) -> dict[str, int]:
    mapping = {}
    for python in VERSIONS:
        series, version = python["series"], python["version"]
        name = f"Python {series} (CPython {version})"
        matches = [row for row in languages if row.get("name") == name]
        if len(matches) != 1 or type(matches[0].get("id")) is not int or matches[0]["id"] <= 0:
            raise ValueError(f"Expected exactly one active language: {name}")
        mapping[series] = matches[0]["id"]
    if len(set(mapping.values())) != len(VERSIONS):
        raise ValueError("Python environments must have distinct IDs")
    return mapping


def submission(client: httpx.Client, language_id: int, code: str, deadline_seconds: float = 30, **limits) -> dict:
    deadline = time.monotonic() + deadline_seconds
    response = client.post("/submissions", params={"base64_encoded": "true", "wait": "false"}, json={
        "language_id": language_id,
        "source_code": base64.b64encode(code.encode("utf-8")).decode("ascii"),
        "stdin": "", "cpu_time_limit": 2, "memory_limit": 256 * 1024,
        "wall_time_limit": 5, "enable_network": False, **limits,
    })
    response.raise_for_status()
    token = response.json()["token"]
    while time.monotonic() < deadline:
        response = client.get(f"/submissions/{token}", params={
            "base64_encoded": "true",
            "fields": "status,stdout,stderr,compile_output,exit_code,message,time,memory",
        })
        response.raise_for_status()
        result = response.json()
        if result["status"]["id"] not in (1, 2):
            for key in ("stdout", "stderr", "compile_output", "message"):
                if result.get(key):
                    result[key] = base64.b64decode(result[key]).decode("utf-8", errors="replace")
            return result
        time.sleep(0.25)
    raise TimeoutError("Judge0 smoke test polling deadline exceeded")


def smoke(client: httpx.Client, mapping: dict[str, int]) -> list[dict]:
    results = []
    for python in VERSIONS:
        series, version = python["series"], python["version"]
        # Test the actual interpreter inside isolate, not the HTTP label or host binary.
        code = ("import sys, ssl, hashlib, ctypes, sqlite3, bz2, lzma, zlib\n"
                "print(sys.version)\n"
                f"assert sys.version_info[:3] == {tuple(map(int, version.split('.')))!r}\n"
                f"assert sys.executable == '/usr/local/code-garden/python-{series}/bin/python{series}'\n")
        result = submission(client, mapping[series], code)
        if result["status"]["id"] != 3 or result.get("exit_code") != 0 or not result.get("stdout", "").startswith(version + " "):
            raise RuntimeError(f"Python {series} smoke failed: {json.dumps(result, ensure_ascii=False)}")
        record = {"series": series, "language_id": mapping[series], "version": result["stdout"].strip()}
        results.append(record)
        print(f"PASS Python {series}: {record['version']}")
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:2358")
    parser.add_argument("--write-env", type=Path, help="Update only JUDGE0_URL and JUDGE0_PYTHON_LANGUAGES after all smoke tests pass")
    parser.add_argument("--check-limits", action="store_true", help="Also verify CPU/memory limits and isolated network namespace")
    args = parser.parse_args()
    try:
        with httpx.Client(base_url=args.url, timeout=10) as client:
            response = client.get("/languages")
            response.raise_for_status()
            mapping = discover(response.json())
            smoke(client, mapping)
            if args.check_limits:
                check_limits(client, mapping)
        line = "JUDGE0_PYTHON_LANGUAGES=" + json.dumps(mapping, separators=(",", ":"))
        print(line)
        if args.write_env:
            update_env(args.write_env, args.url, line)
    except (httpx.HTTPError, ValueError, KeyError, TypeError, RuntimeError, TimeoutError) as exc:
        parser.exit(1, f"Judge0 smoke test failed: {exc}\n")


def check_limits(client: httpx.Client, mapping: dict[str, int]):
    for series, language_id in mapping.items():
        cpu = submission(client, language_id, "while True: pass", cpu_time_limit=0.2, cpu_extra_time=0)
        if cpu["status"]["id"] != 5:
            raise RuntimeError(f"Python {series}: CPU limit was not enforced: {cpu}")
        memory = submission(client, language_id,
                            "print('allocating', flush=True)\nx = bytearray(128 * 1024 * 1024)\nprint('unlimited')",
                            memory_limit=32 * 1024)
        if memory["status"]["id"] not in (7, 8, 11, 12) or "allocating" not in (memory.get("stdout") or ""):
            raise RuntimeError(f"Python {series}: memory limit check failed: {memory}")
        network = submission(client, language_id,
                             "import socket\nassert all(name == 'lo' for _, name in socket.if_nameindex())\nprint('isolated')")
        if network["status"]["id"] != 3 or (network.get("stdout") or "").strip() != "isolated":
            raise RuntimeError(f"Python {series}: network namespace check failed: {network}")
        print(f"PASS Python {series}: CPU and memory limits; isolated network namespace")


def update_env(path: Path, url: str, mapping_line: str):
    # Require an existing backend env; do not silently create an incomplete config.
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    replacements = {"JUDGE0_URL": f"JUDGE0_URL={url}", "JUDGE0_PYTHON_LANGUAGES": mapping_line}
    output = []
    seen = set()
    for line in lines:
        key = line.partition("=")[0].strip()
        if key in replacements:
            if key not in seen:
                output.append(replacements[key])
                seen.add(key)
        else:
            output.append(line)
    output.extend(value for key, value in replacements.items() if key not in seen)
    path.write_text("\n".join(output) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
