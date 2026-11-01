from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.schemas.execution import RunRequest

class DraftWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_code: str = Field(max_length=102400)
    revision: int | None = Field(default=None, ge=0)

    @field_validator("source_code")
    @classmethod
    def byte_limit(cls, value):
        # Empty editor is a valid draft; execution/check still requires nonempty code.
        return RunRequest.byte_limit(value)

class SubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)
