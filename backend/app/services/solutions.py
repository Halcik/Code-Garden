"""Persistence around the existing checker; never execute student code here."""
from datetime import datetime, timezone
from hashlib import sha256
from fastapi import HTTPException
from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import insert
from app.models.solution import SolutionDraft, DraftUsedHint, Submission, SubmissionUsedHint, SolutionTestResult
from app.schemas.solution import DraftWrite
from pydantic import ValidationError


def code_hash(source):
    return sha256(source.encode("utf-8")).hexdigest()


def draft_for(db, student_id, task):
    existing = db.scalar(select(SolutionDraft).where(SolutionDraft.student_id == student_id,
                                                    SolutionDraft.task_id == task.id))
    if existing is not None:
        return existing
    try:
        DraftWrite(source_code=task.starter_code or "")
    except ValidationError:
        raise HTTPException(422, "Starter code exceeds the source code limit") from None
    db.execute(insert(SolutionDraft).values(student_id=student_id, task_id=task.id,
        source_code=task.starter_code or "").on_conflict_do_nothing(index_elements=["student_id", "task_id"]))
    db.commit()
    return db.scalar(select(SolutionDraft).where(SolutionDraft.student_id == student_id,
        SolutionDraft.task_id == task.id).execution_options(populate_existing=True))


def locked_draft(db, draft_id):
    return db.scalar(select(SolutionDraft).where(SolutionDraft.id == draft_id).with_for_update()
                     .execution_options(populate_existing=True))


def save_code(db, draft, source, revision=None):
    draft = locked_draft(db, draft.id)
    if revision is not None and revision != draft.revision:
        raise HTTPException(409, "Draft changed. Reload before saving.")
    if source != draft.source_code:
        draft.source_code = source
        draft.revision += 1
    db.commit()
    return draft


def used_hints(db, draft_id):
    return list(db.scalars(select(DraftUsedHint).where(DraftUsedHint.draft_id == draft_id)
                          .order_by(DraftUsedHint.revealed_at, DraftUsedHint.id)))


def summary(result):
    return dict(passed_tests=result.passed, failed_tests=result.total-result.passed,
                total_tests=result.total, all_passed=result.all_passed)


def store_results(db, tests, result, **owner):
    for test, output in zip(tests, result.results, strict=True):
        db.add(SolutionTestResult(**owner, number=output.number,
            definition=dict(id=test.id, name=test.name, test_type=test.test_type,
                            config=test.config, is_hidden=test.is_hidden, position=test.position),
            student_result=output.model_dump(mode="json", exclude_none=True)))


def store_check(db, draft, tests, result, source):
    draft.checked_hash = code_hash(source)
    draft.checked_at = datetime.now(timezone.utc)
    draft.check_summary = summary(result)
    db.execute(delete(SolutionTestResult).where(SolutionTestResult.draft_id == draft.id))
    store_results(db, tests, result, draft_id=draft.id)


def public_check(db, draft):
    if draft.check_summary is None:
        return None
    rows = db.scalars(select(SolutionTestResult).where(SolutionTestResult.draft_id == draft.id)
                      .order_by(SolutionTestResult.number))
    return dict(passed=draft.check_summary["passed_tests"], total=draft.check_summary["total_tests"],
                all_passed=draft.check_summary["all_passed"], results=[r.student_result for r in rows])


def public_submission(row):
    return dict(id=row.id, version=row.version, submitted_at=row.submitted_at, **row.summary)


def public_draft(db, draft):
    latest = db.scalar(select(Submission).where(Submission.student_id == draft.student_id,
        Submission.task_id == draft.task_id).order_by(Submission.version.desc()).limit(1))
    return dict(id=draft.id, source_code=draft.source_code, revision=draft.revision,
        created_at=draft.created_at, updated_at=draft.updated_at, check_count=draft.check_count,
        checked_at=draft.checked_at, checked_hash=draft.checked_hash,
        check_is_current=draft.checked_hash == code_hash(draft.source_code), last_check=public_check(db, draft),
        used_hints=[dict(hint_id=h.hint_id, revealed_at=h.revealed_at) for h in used_hints(db, draft.id)],
        latest_submission=public_submission(latest) if latest else None)
