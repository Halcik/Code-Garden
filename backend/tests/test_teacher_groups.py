"""Group API, ownership and membership persistence on real PostgreSQL."""
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token
from app.models.group import StudentGroup, group_students
from app.models.user import AccountStatus, TeacherApproval, User, UserRole


@pytest.fixture(scope="module")
def group_users(client, db_engine):
    ids = {}
    with Session(db_engine) as db:
        for name, role in [("first", UserRole.TEACHER), ("second", UserRole.TEACHER),
                           ("student", UserRole.STUDENT), ("admin", UserRole.ADMIN),
                           ("pending", UserRole.TEACHER), ("inactive", UserRole.TEACHER)]:
            user = User(login=name, email=f"{name}@example.com", role=role, password_hash="unused",
                        teacher_approval=(TeacherApproval.PENDING if name == "pending" else TeacherApproval.APPROVED)
                        if role == UserRole.TEACHER else None,
                        status=AccountStatus.INACTIVE if name == "inactive" else AccountStatus.ACTIVE)
            db.add(user)
            db.flush()
            ids[name] = user.id
        db.commit()
    return ids


def authenticate(client, ids, name):
    client.cookies.clear()
    if name:
        client.cookies.set(get_settings().cookie_name, create_access_token(ids[name]))


@pytest.mark.parametrize("name,expected", [(None, 401), ("student", 403), ("admin", 403),
                                           ("pending", 403), ("inactive", 403)])
def test_all_endpoints_require_approved_active_teacher(client, group_users, name, expected):
    authenticate(client, group_users, name)
    for method, path, payload in [
        ("GET", "/teacher/groups", None), ("POST", "/teacher/groups", {"name": "New"}),
        ("GET", "/teacher/groups/1", None), ("PATCH", "/teacher/groups/1", {"name": "Changed"}),
        ("DELETE", "/teacher/groups/1", None),
    ]:
        assert client.request(method, path, json=payload).status_code == expected


def test_create_list_detail_update_and_delete_own_group(client, group_users, db_engine):
    authenticate(client, group_users, "first")
    response = client.post("/teacher/groups", json={"name": " Python ", "description": " Basics ",
                                                  "age_range": " 14–18 lat ", "study_streak_enabled": True})
    assert response.status_code == 201
    group = response.json()
    assert group["teacher_id"] == group_users["first"]
    assert group["name"] == "Python"
    assert group["description"] == "Basics"
    assert group["created_at"]
    assert group["student_count"] == 0
    assert group["age_range"] == "14–18 lat"
    assert group["achievements_enabled"] is True
    assert group["study_streak_enabled"] is True
    path = f'/teacher/groups/{group["id"]}'
    assert client.get(path).json() == group
    assert group in client.get("/teacher/groups").json()
    with Session(db_engine) as db:
        assert db.get(StudentGroup, group["id"]).teacher_id == group_users["first"]
        assert db.get(StudentGroup, group["id"]).students == []
    changed = client.patch(path, json={"name": "Advanced"})
    assert changed.status_code == 200
    assert changed.json()["name"] == "Advanced"
    assert changed.json()["description"] == "Basics"
    assert client.patch(path, json={"description": None}).json()["description"] is None
    changed_defaults = client.patch(path, json={"age_range": None, "achievements_enabled": False}).json()
    assert changed_defaults["age_range"] is None
    assert changed_defaults["achievements_enabled"] is False
    assert changed_defaults["study_streak_enabled"] is True
    assert client.get(path).json()["name"] == "Advanced"
    assert client.delete(path).status_code == 204
    assert client.get(path).status_code == 404
    assert not any(item["id"] == group["id"] for item in client.get("/teacher/groups").json())


def test_other_teachers_cannot_read_edit_or_delete_group(client, group_users):
    authenticate(client, group_users, "second")
    group = client.post("/teacher/groups", json={"name": "Private"}).json()
    path = f'/teacher/groups/{group["id"]}'
    authenticate(client, group_users, "first")
    assert all(item["teacher_id"] == group_users["first"] for item in client.get("/teacher/groups").json())
    assert group not in client.get("/teacher/groups").json()
    for target in [path, "/teacher/groups/2147483647"]:
        for method, payload in [("GET", None), ("PATCH", {"name": "Stolen"}), ("DELETE", None)]:
            response = client.request(method, target, json=payload)
            assert response.status_code == 404
            assert response.json() == {"detail": "Group not found"}
    authenticate(client, group_users, "second")
    assert client.get(path).json() == group
    assert client.delete(path).status_code == 204


@pytest.mark.parametrize("payload", [{"name": " "}, {"name": None}, {"name": "x" * 201},
                                     {"name": 123}, {"teacher_id": 2}, {"students": []}, {"description": 123}])
def test_reject_invalid_or_privileged_fields(client, group_users, payload):
    authenticate(client, group_users, "first")
    group = client.post("/teacher/groups", json={"name": "Validation"}).json()
    path = f'/teacher/groups/{group["id"]}'
    assert client.post("/teacher/groups", json={"name": "Valid", **payload}).status_code == 422
    assert client.patch(path, json=payload).status_code == 422
    assert client.patch(path, json={}).status_code == 422
    assert client.get(path).json() == group
    client.delete(path)


def test_empty_list_cache_and_origin_protection(client, group_users):
    authenticate(client, group_users, "second")
    result = client.get("/teacher/groups")
    assert result.json() == []
    assert result.headers["cache-control"] == "no-store"
    group = client.post("/teacher/groups", json={"name": "Origin"}).json()
    path = f'/teacher/groups/{group["id"]}'
    for method, target, data in [("POST", "/teacher/groups", {"name": "Blocked"}),
                                 ("PATCH", path, {"name": "Blocked"}), ("DELETE", path, None)]:
        assert client.request(method, target, json=data, headers={"Origin": "https://untrusted.example"}).status_code == 403
    assert client.get(path).json() == group
    assert client.get(path).headers["cache-control"] == "no-store"
    assert client.patch(path, json={"description": "Updated"}).headers["cache-control"] == "no-store"
    assert client.delete(path).headers["cache-control"] == "no-store"


def test_many_to_many_membership_unique_and_group_deletion_preserves_student(client, group_users, db_engine):
    with Session(db_engine) as db:
        groups = [StudentGroup(name=name, teacher_id=group_users["first"]) for name in ["One", "Two"]]
        student = db.get(User, group_users["student"])
        for group in groups:
            group.students.append(student)
        db.add_all(groups)
        db.commit()
        assert {group.id for group in student.student_groups} == {group.id for group in groups}
        authenticate(client, group_users, "first")
        listed = {item["id"]: item for item in client.get("/teacher/groups").json()}
        for group in groups:
            assert listed[group.id]["student_count"] == 1
            assert client.get(f"/teacher/groups/{group.id}").json()["student_count"] == 1
        with pytest.raises(IntegrityError):
            db.execute(group_students.insert().values(group_id=groups[0].id, student_id=student.id))
            db.commit()
        db.rollback()
        removed_id = groups[0].id
        db.delete(groups[0])
        db.commit()
        assert db.scalar(select(group_students.c.group_id).where(group_students.c.group_id == removed_id)) is None
        assert db.get(User, student.id) is not None
        db.refresh(student)
        assert len(student.student_groups) == 1
        db.delete(groups[1])
        db.commit()
