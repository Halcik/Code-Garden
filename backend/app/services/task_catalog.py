from sqlalchemy import case, func, select

from app.models.task import Task
from app.models.solution import SolutionDraft, Submission
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


def task_page(db, filters, *, sort_by, sort_order, limit, offset, student_id=None, progress_status=None):
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
    column = getattr(Task, sort_by)
    ordering = column.asc() if sort_order == "asc" else column.desc()
    total = db.scalar(select(func.count()).select_from(Task).where(*filters))
    query = select(Task) if progress is None else select(Task, progress)
    query = query.where(*filters).order_by(ordering, Task.id.asc()).limit(limit).offset(offset)
    if progress is None:
        items = db.scalars(query).all()
    else:
        items = [dict(**StudentTaskResponse.model_validate(task).model_dump(), progress_status=status)
                 for task, status in db.execute(query)]
    page = {"items": items, "total": total, "limit": limit, "offset": offset}
    if progress_counts is not None:
        page["progress_counts"] = progress_counts
    return page
