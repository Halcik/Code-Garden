import asyncio
import base64
import binascii
import re

import httpx

from app.core.config import Settings
from app.schemas.execution import RunResponse


class Judge0Error(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(message)


class Judge0Service:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self.transport = transport

    async def request(self, client, method, path, **kwargs):
        try:
            response = await client.request(method, path, **kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 422:
                raise Judge0Error(503, "Judge0 does not support this environment or execution limits") from None
            raise Judge0Error(503, "Judge0 is unavailable") from None
        except httpx.RequestError:
            raise Judge0Error(503, "Judge0 is unavailable") from None
        except ValueError:
            raise Judge0Error(502, "Invalid Judge0 response") from None

    async def create_submission(self, client: httpx.AsyncClient, *, source_code: str, stdin: str, language_id: int, cpu: float, memory: int) -> str:
        result = await self.request(client, "POST", "/submissions", params={"base64_encoded": "true", "wait": "false"}, json={
            "source_code": base64.b64encode(source_code.encode()).decode(),
            "stdin": base64.b64encode(stdin.encode()).decode(),
            "language_id": language_id, "cpu_time_limit": cpu,
            "memory_limit": memory * 1024, "wall_time_limit": max(5, cpu + 3),
            "enable_network": False,
        })
        token = result.get("token") if isinstance(result, dict) else None
        if not isinstance(token, str) or not re.fullmatch(r"[a-zA-Z0-9-]{1,100}", token):
            raise Judge0Error(502, "Judge0 did not return a valid token")
        return token

    async def get_submission(self, client: httpx.AsyncClient, token: str):
        return await self.request(client, "GET", f"/submissions/{token}", params={"base64_encoded": "true", "fields": "status,stdout,stderr,compile_output,exit_code,time,memory"})

    async def run_code(self, *, source_code: str, stdin: str, python_version: str, time_limit_seconds: float, memory_limit_mb: int) -> RunResponse:
        language_id = self.settings.judge0_python_languages.get(python_version)
        if language_id is None:
            raise Judge0Error(503, "Python environment is not configured in Judge0")
        try:
            async with asyncio.timeout(self.settings.judge0_max_wait_seconds):
                async with httpx.AsyncClient(base_url=self.settings.judge0_url, transport=self.transport, timeout=self.settings.judge0_max_wait_seconds) as client:
                    languages = await self.request(client, "GET", "/languages")
                    if not isinstance(languages, list) or any(not isinstance(item, dict) for item in languages):
                        raise Judge0Error(502, "Invalid Judge0 language list")
                    language = next((item for item in languages if item.get("id") == language_id), None)
                    if language is None or not re.search(r"Python.*(?<![\d.])" + re.escape(python_version) + r"(?!\d)", str(language.get("name", ""))):
                        raise Judge0Error(503, "Requested Python version is unavailable in Judge0")
                    token = await self.create_submission(client, source_code=source_code, stdin=stdin, language_id=language_id, cpu=time_limit_seconds, memory=memory_limit_mb)
                    while True:
                        result = await self.get_submission(client, token)
                        status = result["status"]["id"]
                        if type(status) is not int or status not in range(1, 15):
                            raise ValueError("Invalid status")
                        if status not in (1, 2):
                            if status in (13, 14):
                                raise Judge0Error(502, "Judge0 could not execute the program")
                            def decode(value):
                                if value is None:
                                    return None
                                if not isinstance(value, str):
                                    raise ValueError("Invalid encoded output")
                                # Judge0 CE uses Ruby Base64.encode64, which wraps
                                # lines and appends LF. Keep strict alphabet checks.
                                encoded = value.replace("\r", "").replace("\n", "")
                                return base64.b64decode(encoded, validate=True).decode("utf-8", errors="replace")
                            return RunResponse(status="completed" if status == 3 else "time_limit_exceeded" if status == 5 else "execution_error",
                                stdout=decode(result.get("stdout")), stderr=decode(result.get("stderr") or result.get("compile_output")),
                                exit_code=result.get("exit_code"), time=result.get("time"), memory=result.get("memory"))
                        await asyncio.sleep(self.settings.judge0_poll_interval_ms / 1000)
        except TimeoutError:
            raise Judge0Error(504, "Timed out waiting for Judge0") from None
        except (KeyError, TypeError, ValueError, binascii.Error):
            raise Judge0Error(502, "Invalid Judge0 response") from None
