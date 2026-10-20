from sqlalchemy import func, select

from app.models.task import Task


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


def task_page(db, filters, *, sort_by, sort_order, limit, offset):
    column = getattr(Task, sort_by)
    ordering = column.asc() if sort_order == "asc" else column.desc()
    total = db.scalar(select(func.count()).select_from(Task).where(*filters))
    items = db.scalars(select(Task).where(*filters).order_by(ordering, Task.id.asc())
                       .limit(limit).offset(offset)).all()
    return {"items": items, "total": total, "limit": limit, "offset": offset}
