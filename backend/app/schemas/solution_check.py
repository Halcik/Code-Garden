from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from app.schemas.execution import RunRequest, RunResponse


class CheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_code: str = Field(min_length=1, max_length=102400)
    revision: int | None = Field(default=None, ge=0)

    # Share the UTF-8 byte limit with local execution, without accepting stdin.
    def model_post_init(self, context):
        RunRequest(source_code=self.source_code)


class PublicTestDetails(BaseModel):
    name: str
    config: dict[str, JsonValue]
    actual_output: str | None = None
    actual_result: JsonValue = None
    has_actual_result: bool = False
    execution: RunResponse | None = None
    message: str | None = None


class TestResult(BaseModel):
    number: int
    position: int
    test_type: Literal["INPUT_OUTPUT", "FUNCTION", "STRUCTURAL"]
    is_public: bool
    status: Literal["passed", "failed"]
    details: PublicTestDetails | None = None


class CheckResponse(BaseModel):
    passed: int
    total: int
    all_passed: bool
    results: list[TestResult]
