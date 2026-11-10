from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.api.dependencies import check_origin, require_role
from app.db.session import get_db
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.user import User, UserRole
from app.schemas.task_assignment import (AssignGroup, AssignStudent, AssignmentResponse,
                                        AssignmentStudent, GroupAssignmentResponse, GroupTaskAssignment)
from app.services import task_assignments as service

router = APIRouter(prefix="/teacher", tags=["task assignments"])


@router.get("/assignment-students", response_model=list[AssignmentStudent])
def assignment_students(response: Response, q: str = Query("", max_length=50),
        teacher: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    query = service.teacher_student_query(teacher.id)
    if q.strip():
        query = query.where(User.login.icontains(q.strip(), autoescape=True))
    return db.execute(query.order_by(User.login, User.id).limit(100)).mappings().all()


@router.get("/tasks/{task_id}/assignments", response_model=list[AssignmentResponse])
def list_assignments(task_id: int, response: Response,
        teacher: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    # Preserve history for the author's archived or draft tasks as well.
    task = db.get(Task, task_id)
    has_own_source = db.scalar(select(TaskAssignment.id).where(TaskAssignment.task_id == task_id,
        TaskAssignment.assigned_by_teacher_id == teacher.id).limit(1)) is not None
    if (task is None or task.author_id != teacher.id) and not has_own_source:
        service.available_assignment_task(db, task_id, teacher.id)
    return service.assignment_rows(db, task_id, teacher.id)


@router.post("/tasks/{task_id}/assignments", response_model=AssignmentResponse, status_code=201,
             dependencies=[Depends(check_origin)])
def create_assignment(task_id: int, payload: AssignStudent, response: Response,
        teacher: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return service.assign_student(db, task_id, payload.student_id, teacher.id)


@router.post("/tasks/{task_id}/group-assignments", response_model=GroupAssignmentResponse,
             dependencies=[Depends(check_origin)])
def create_group_assignment(task_id: int, payload: AssignGroup, response: Response,
        teacher: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return service.assign_group(db, task_id, payload.group_id, teacher.id)


@router.get("/groups/{group_id}/task-assignments", response_model=list[GroupTaskAssignment])
def list_group_task_assignments(group_id: int, response: Response,
        teacher: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return service.group_assignment_rows(db, group_id, teacher.id)


@router.delete("/groups/{group_id}/task-assignments/{task_id}", status_code=204,
               dependencies=[Depends(check_origin)])
def delete_group_task_assignment(group_id: int, task_id: int, response: Response,
        teacher: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    service.remove_group_assignment(db, group_id, task_id, teacher.id)


@router.delete("/tasks/{task_id}/assignments/{assignment_id}", status_code=204,
               dependencies=[Depends(check_origin)])
def revoke_task_assignment(task_id: int, assignment_id: int, response: Response,
        teacher: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    service.revoke_assignment(db, task_id, assignment_id, teacher.id)
