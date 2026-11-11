from sqlalchemy import case, func, select

from app.models.task_assignment import TaskAssignment
from app.models.task import Task
from app.models.solution import SolutionDraft, Submission
from app.models.review import SubmissionReview
from app.schemas.task import StudentTaskResponse


def task_filters(*, search=None, topic=None, difficulty=None, task_type=None):
    filters = []
    if search and search.strip():
        filters.append(Task.title.icontains(search.strip(), autoescape=True))
    if topic and topic.strip():
        filters.append(func.lower(Task.topic) == topic.strip().lower())
    if difficulty is not None:
        filters.append(Task.difficulty == difficulty)
    if task_type is not None:
        filters.append(Task.task_type == task_type)
    return filters


def task_page(db, filters, *, sort_by, sort_order, limit, offset, student_id=None, progress_status=None, overdue=False, assignment_deadlines=False):
    count_filters = list(filters)
    progress = None
    progress_counts = None
    if student_id is not None:
        submitted = select(Submission.id).where(Submission.student_id == student_id, Submission.task_id == Task.id).exists()
        started = select(SolutionDraft.id).where(SolutionDraft.student_id == student_id, SolutionDraft.task_id == Task.id).exists()
        progress = case((submitted, "COMPLETED"), (started, "IN_PROGRESS"), else_="NOT_STARTED")
        statuses = select(progress.label("status")).select_from(Task).where(*filters).subquery()
        progress_counts = dict.fromkeys(("NOT_STARTED", "IN_PROGRESS", "COMPLETED"), 0)
        progress_counts.update(dict(db.execute(select(statuses.c.status, func.count()).group_by(statuses.c.status)).all()))
        if progress_status is not None:
            filters = [*filters, progress == progress_status]
    deadline = select(func.min(TaskAssignment.deadline)).where(
        TaskAssignment.student_id == student_id, TaskAssignment.task_id == Task.id).correlate(Task).scalar_subquery()
    # Lateness is independent of progress; submitted work is no longer outstanding.
    is_overdue = (deadline < func.now()) & (progress != "COMPLETED") if progress is not None else None
    overdue_count = db.scalar(select(func.count()).select_from(Task).where(
        *count_filters, is_overdue)) if student_id is not None else 0
    if overdue and assignment_deadlines:
        filters = [*filters, is_overdue]
    column = getattr(Task, sort_by)
    ordering = column.asc() if sort_order == "asc" else column.desc()
    total = db.scalar(select(func.count()).select_from(Task).where(*filters))
    query = select(Task) if progress is None else select(Task, progress)
    if assignment_deadlines:
        query = query.add_columns(deadline, func.coalesce(is_overdue, False))
    query = query.where(*filters).order_by(ordering, Task.id.asc()).limit(limit).offset(offset)
    if progress is None:
        items = db.scalars(query).all()
    else:
        rows = db.execute(query).all()
        items = [dict(**StudentTaskResponse.model_validate(task).model_dump(), progress_status=status)
                 for task, status, *_ in rows]
        if assignment_deadlines:
            for item, row in zip(items, rows):
                item.update(deadline=row[2], is_overdue=row[3])
        if items:
            latest = select(Submission.task_id.label("task_id"), func.max(Submission.version).label("version")).where(
                Submission.student_id == student_id, Submission.task_id.in_([item['id'] for item in items])
            ).group_by(Submission.task_id).subquery()
            reviews = dict(db.execute(select(Submission.task_id, SubmissionReview.decision).join(latest,
                (Submission.task_id == latest.c.task_id) & (Submission.version == latest.c.version)).outerjoin(
                    SubmissionReview, SubmissionReview.submission_id == Submission.id).where(
                        Submission.student_id == student_id)).all())
            for item in items:
                item['review_status'] = (reviews[item['id']] or 'PENDING') if item['id'] in reviews else None
    page = {"items": items, "total": total, "limit": limit, "offset": offset}
    if progress_counts is not None:
        page["progress_counts"] = progress_counts
        page["overdue_count"] = overdue_count
    return page
