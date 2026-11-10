from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class GroupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    age_range: str | None = Field(default=None, min_length=1, max_length=50)
    achievements_enabled: bool = True
    study_streak_enabled: bool = False


class GroupUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    age_range: str | None = Field(default=None, min_length=1, max_length=50)
    achievements_enabled: bool | None = None
    study_streak_enabled: bool | None = None

    @model_validator(mode="after")
    def check_patch(self):
        required = {"name", "achievements_enabled", "study_streak_enabled"}
        if not self.model_fields_set or any(getattr(self, key) is None for key in self.model_fields_set & required):
            raise ValueError("Provide at least one field; name and motivation settings cannot be null")
        return self


class GroupResponse(GroupCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    teacher_id: int
    created_at: datetime
    student_count: int
    pending_invitation_count: int
    active_task_count: int
