"""Assignment grants and a single reviewer per student's task, never task ownership."""
from fastapi import HTTPException
from sqlalchemy import and_, or_, select, update
from app.models.solution import SolutionDraft, Submission
from app.models.task_assignment import TaskAssignment


def submission_access(teacher_id):
    assigned = select(TaskAssignment.id).where(
        TaskAssignment.task_id == Submission.task_id,
        TaskAssignment.student_id == Submission.student_id,
        TaskAssignment.assigned_by_teacher_id == teacher_id).correlate(Submission).exists()
    return or_(Submission.reviewer_teacher_id == teacher_id,
               and_(Submission.reviewer_teacher_id.is_(None),
                    or_(Submission.is_catalog_submission.is_(True), assigned)))


def accessible_submission(db, submission_id, teacher_id):
    row = db.scalar(select(Submission).where(Submission.id == submission_id, submission_access(teacher_id)))
    if row is None:
        raise HTTPException(404, "Submission not found")
    return row


def claim_submission(db, submission_id, teacher_id):
    # All claims and formal submissions lock the same student/task draft. This
    # also makes reviewer continuity safe when a new version arrives concurrently.
    row = db.get(Submission, submission_id)
    if row is None:
        raise HTTPException(404, "Submission not found")
    draft = db.scalar(select(SolutionDraft).where(SolutionDraft.student_id == row.student_id,
        SolutionDraft.task_id == row.task_id).with_for_update().execution_options(populate_existing=True))
    if draft is None:
        raise HTTPException(409, "Submission has no work context")
    db.refresh(row)
    if row.reviewer_teacher_id is not None or draft.reviewer_teacher_id is not None:
        raise HTTPException(409, "Submission already claimed")
    accessible_submission(db, submission_id, teacher_id)
    draft.reviewer_teacher_id = teacher_id
    db.execute(update(Submission).where(Submission.student_id == row.student_id,
        Submission.task_id == row.task_id, Submission.reviewer_teacher_id.is_(None))
        .values(reviewer_teacher_id=teacher_id))
    db.commit()
    return {"reviewer_teacher_id": teacher_id}
