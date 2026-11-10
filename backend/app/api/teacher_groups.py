from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import check_origin, require_role
from app.db.session import get_db
from app.models.group import StudentGroup
from app.models.user import User, UserRole
from app.schemas.group import GroupCreate, GroupResponse, GroupUpdate
from app.services.groups import owned_group

router = APIRouter(prefix="/teacher/groups", tags=["teacher groups"])


@router.get("", response_model=list[GroupResponse])
def list_groups(response: Response, teacher: User = Depends(require_role(UserRole.TEACHER)),
                db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return list(db.scalars(select(StudentGroup).where(StudentGroup.teacher_id == teacher.id)
                           .order_by(StudentGroup.created_at.desc(), StudentGroup.id.desc())))


@router.post("", response_model=GroupResponse, status_code=201, dependencies=[Depends(check_origin)])
def create_group(payload: GroupCreate, response: Response,
                 teacher: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    group = StudentGroup(**payload.model_dump(), teacher_id=teacher.id)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.get("/{group_id}", response_model=GroupResponse)
def get_group(group_id: int, response: Response,
              teacher: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return owned_group(db, group_id, teacher.id)


@router.patch("/{group_id}", response_model=GroupResponse, dependencies=[Depends(check_origin)])
def update_group(group_id: int, payload: GroupUpdate, response: Response,
                 teacher: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    group = owned_group(db, group_id, teacher.id, lock=True)
    for name, value in payload.model_dump(exclude_unset=True).items():
        setattr(group, name, value)
    db.commit()
    db.refresh(group)
    return group


@router.delete("/{group_id}", status_code=204, dependencies=[Depends(check_origin)])
def delete_group(group_id: int, response: Response,
                 teacher: User = Depends(require_role(UserRole.TEACHER)), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    group = owned_group(db, group_id, teacher.id, lock=True)
    db.delete(group)
    db.commit()
