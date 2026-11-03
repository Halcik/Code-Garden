from datetime import datetime
from pydantic import BaseModel, JsonValue, Field
from app.schemas.review import ReviewResponse


class SubmissionSummary(BaseModel):
    id: int
    version: int
    submitted_at: datetime
    passed_tests: int
    failed_tests: int
    total_tests: int
    all_passed: bool
    review: ReviewResponse = Field(default_factory=ReviewResponse)


class SubmissionStudent(BaseModel):
    id: int
    login: str
    status: str


class StudentSubmissions(BaseModel):
    student: SubmissionStudent
    submission_count: int
    latest_submission: SubmissionSummary


class SubmissionPage(BaseModel):
    items: list[StudentSubmissions]
    total: int
    limit: int
    offset: int


class SubmissionHistory(BaseModel):
    student: SubmissionStudent | None
    items: list[SubmissionSummary]


class UsedHintSnapshot(BaseModel):
    hint_id: int
    reveal_order: int
    revealed_at: datetime


class TeacherTestSnapshot(BaseModel):
    number: int
    definition: dict[str, JsonValue]
    result: dict[str, JsonValue]
    execution_details_available: bool


class SubmissionDetail(SubmissionSummary):
    task_id: int
    total_hints: int
    student: SubmissionStudent
    source_code: str
    used_hints: list[UsedHintSnapshot]
    test_results: list[TeacherTestSnapshot]


class QueueTask(BaseModel):
    id: int
    title: str
    topic: str


class QueueItem(StudentSubmissions):
    task: QueueTask
    used_hint_count: int


class SubmissionQueue(BaseModel):
    items: list[QueueItem]
    total: int
    limit: int
    offset: int
    tasks: list[QueueTask]
