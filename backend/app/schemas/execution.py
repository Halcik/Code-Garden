from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_code: str = Field(min_length=1, max_length=102400)
    stdin: str = Field(default="", max_length=102400)

    @field_validator("source_code", "stdin")
    @classmethod
    def byte_limit(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 102400:
            raise ValueError("Input must not exceed 100 KB (UTF-8)")
        return value

class RunResponse(BaseModel):
    status: Literal["completed", "execution_error", "time_limit_exceeded"]
    stdout: str | None = None
    stderr: str | None = None
    exit_code: int | None = None
    time: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    memory: int | None = Field(default=None, ge=0)
