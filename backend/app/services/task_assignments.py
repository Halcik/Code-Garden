from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.group import StudentGroup, group_students
from app.models.task import Task, TaskStatus
from app.models.task_assignment import TaskAssignment
from app.models.user import User, UserRole
from app.services.groups import owned_group


def assignable_task_filters(teacher_id: int):
    # There is no publication flag yet. Match the existing ready-task catalogue.
    # Future own/public visibility belongs here, independently of assignments.
    return [Task.status == TaskStatus.READY, Task.is_archived.is_(False)]


def available_assignment_task(db: Session, task_id: int, teacher_id: int):
    task = db.scalar(select(Task).where(Task.id == task_id, *assignable_task_filters(teacher_id)))
    if task is None:
        raise HTTPException(404, "Task unavailable for assignment")
    return task


def teacher_student_query(teacher_id: int):
    membership = select(group_students.c.student_id).join(
        StudentGroup, StudentGroup.id == group_students.c.group_id).where(
            StudentGroup.teacher_id == teacher_id, group_students.c.student_id == User.id).exists()
    return select(User.id, User.login).where(User.role == UserRole.STUDENT, membership)


def assignment_rows(db: Session, task_id: int, teacher_id: int):
    # A teacher sees only assignments they created, including after a student leaves.
    return db.execute(select(TaskAssignment.id, TaskAssignment.task_id, TaskAssignment.student_id,
        User.login.label("student_login"), TaskAssignment.assigned_by_teacher_id,
        TaskAssignment.group_id, TaskAssignment.source_group_id,
        StudentGroup.name.label("group_name"), TaskAssignment.created_at)
        .join(User, User.id == TaskAssignment.student_id)
        .outerjoin(StudentGroup, StudentGroup.id == TaskAssignment.group_id)
        .where(TaskAssignment.task_id == task_id, TaskAssignment.assigned_by_teacher_id == teacher_id)
        .order_by(User.login, TaskAssignment.id)).mappings().all()


def assign_student(db: Session, task_id: int, student_id: int, teacher_id: int):
    available_assignment_task(db, task_id, teacher_id)
    student = db.get(User, student_id)
    if student is None:
        raise HTTPException(404, "Student not found")
    if student.role != UserRole.STUDENT:
        raise HTTPException(422, "Assignment recipient must be a student")
    if db.execute(teacher_student_query(teacher_id).where(User.id == student_id)).first() is None:
        raise HTTPException(403, "Student does not belong to your groups")
    assignment_id = db.scalar(insert(TaskAssignment).values(task_id=task_id, student_id=student_id,
        assigned_by_teacher_id=teacher_id).on_conflict_do_nothing(
            constraint="uq_task_assignments_source").returning(TaskAssignment.id))
    if assignment_id is None:
        raise HTTPException(409, "Student already has this task assigned")
    db.commit()
    return next(row for row in assignment_rows(db, task_id, teacher_id) if row["id"] == assignment_id)


def assign_group(db: Session, task_id: int, group_id: int, teacher_id: int):
    available_assignment_task(db, task_id, teacher_id)
    # Membership changes in KAN-44 lock the same group: take one consistent snapshot.
    owned_group(db, group_id, teacher_id, lock=True)
    student_ids = list(db.scalars(select(User.id).join(group_students,
        group_students.c.student_id == User.id).where(group_students.c.group_id == group_id,
                                                     User.role == UserRole.STUDENT)))
    assigned = 0
    if student_ids:
        assigned = len(list(db.scalars(insert(TaskAssignment).values([
            dict(task_id=task_id, student_id=student_id, assigned_by_teacher_id=teacher_id,
                 group_id=group_id, source_group_id=group_id)
            for student_id in student_ids]).on_conflict_do_nothing(
                constraint="uq_task_assignments_source").returning(TaskAssignment.id))))
    db.commit()
    return dict(total_students=len(student_ids), assigned_count=assigned,
                already_assigned_count=len(student_ids) - assigned)


def revoke_assignment(db: Session, task_id: int, assignment_id: int, teacher_id: int):
    removed = db.scalar(delete(TaskAssignment).where(TaskAssignment.id == assignment_id,
        TaskAssignment.task_id == task_id, TaskAssignment.assigned_by_teacher_id == teacher_id)
        .returning(TaskAssignment.id))
    if removed is None:
        raise HTTPException(404, "Assignment not found")
    db.commit()


def group_assignment_rows(db: Session, group_id: int, teacher_id: int):
    owned_group(db, group_id, teacher_id)
    return db.execute(select(Task.id.label("task_id"), Task.title, Task.topic, Task.difficulty,
        Task.is_archived, func.count(TaskAssignment.id).label("student_count"),
        func.min(TaskAssignment.created_at).label("created_at"))
        .join(TaskAssignment, TaskAssignment.task_id == Task.id)
        .where(TaskAssignment.group_id == group_id, TaskAssignment.assigned_by_teacher_id == teacher_id)
        .group_by(Task.id).order_by(func.min(TaskAssignment.created_at).desc(), Task.id.desc())).mappings().all()


def remove_group_assignment(db: Session, group_id: int, task_id: int, teacher_id: int):
    # Serialize with assigning and membership changes. The source, not current
    # membership, defines which assignments are revoked (including former members).
    owned_group(db, group_id, teacher_id, lock=True)
    db.execute(delete(TaskAssignment).where(TaskAssignment.group_id == group_id,
        TaskAssignment.task_id == task_id, TaskAssignment.assigned_by_teacher_id == teacher_id))
    db.commit()
