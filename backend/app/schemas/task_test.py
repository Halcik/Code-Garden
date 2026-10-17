from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_validator, model_validator


class InputOutputConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    input_data: str = ""
    expected_output: str = Field(min_length=1)


class FunctionConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    function_name: str = Field(min_length=1)
    arguments: list[JsonValue]
    expected_result: JsonValue

    @field_validator("function_name")
    @classmethod
    def name_required(cls, value):
        if not value.strip():
            raise ValueError("Function name is required")
        return value.strip()


class StructuralConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    rule_type: Literal["FUNCTION_EXISTS", "CLASS_EXISTS", "CALLS_FUNCTION", "USES_FOR", "USES_WHILE", "USES_IF"]
    expected_value: str | None = None

    @model_validator(mode="after")
    def check_value(self):
        if self.rule_type in {"FUNCTION_EXISTS", "CLASS_EXISTS", "CALLS_FUNCTION"}:
            if not self.expected_value or not self.expected_value.strip():
                raise ValueError("Expected name is required")
            self.expected_value = self.expected_value.strip()
        elif self.expected_value is not None:
            raise ValueError("This rule does not accept an expected value")
        return self


class TaskTestWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str = Field(min_length=1, max_length=200)
    test_type: Literal["INPUT_OUTPUT", "FUNCTION", "STRUCTURAL"]
    config: dict[str, JsonValue]
    is_hidden: bool = False

    @field_validator("name")
    @classmethod
    def check_name(cls, value):
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()

    @model_validator(mode="after")
    def validate_config(self):
        schema = {"INPUT_OUTPUT": InputOutputConfig, "FUNCTION": FunctionConfig, "STRUCTURAL": StructuralConfig}[self.test_type]
        self.config = schema.model_validate(self.config).model_dump()
        return self


class TaskTestPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str | None = None
    test_type: Literal["INPUT_OUTPUT", "FUNCTION", "STRUCTURAL"] | None = None
    config: dict[str, JsonValue] | None = None
    is_hidden: bool | None = None

    @model_validator(mode="after")
    def check_patch(self):
        if not self.model_fields_set or any(getattr(self, key) is None for key in self.model_fields_set):
            raise ValueError("Provide non-null fields")
        return self


class TaskTestResponse(TaskTestWrite):
    model_config = ConfigDict(from_attributes=True)
    id: int
    task_id: int
    position: int
    created_at: datetime
    updated_at: datetime


class TaskTestReorder(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    test_ids: list[int]
