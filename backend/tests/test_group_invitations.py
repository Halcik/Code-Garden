from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token
from app.models.group import StudentGroup, group_students
from app.models.group_invitation import GroupInvitation, GroupInvitationCode
from app.models.user import AccountStatus, TeacherApproval, User, UserRole
from app.services import groups


@pytest.fixture(scope="module")
def users(client, db_engine):
    result = {}
    with Session(db_engine) as db:
        for name, role in [("teacher", UserRole.TEACHER), ("other_teacher", UserRole.TEACHER),
                           ("student_a", UserRole.STUDENT), ("student_b", UserRole.STUDENT),
                           ("inactive", UserRole.STUDENT), ("admin", UserRole.ADMIN), ("pending", UserRole.TEACHER)]:
            user = User(login=name, email=f"{name}@example.com", password_hash="unused", role=role,
                        status=AccountStatus.INACTIVE if name == "inactive" else AccountStatus.ACTIVE,
                        teacher_approval=(TeacherApproval.PENDING if name == "pending" else TeacherApproval.APPROVED)
                        if role == UserRole.TEACHER else None)
            db.add(user); db.flush(); result[name] = user.id
        db.commit()
    return result


def auth(client, users, name):
    client.cookies.clear()
    if name:
        client.cookies.set(get_settings().cookie_name, create_access_token(users[name]))


@pytest.fixture
def group(client, users):
    auth(client, users, "teacher")
    response = client.post("/teacher/groups", json={"name": "Python " + uuid4().hex[:8]})
    assert response.status_code == 201
    return response.json()


def invite(client, users, group, student="student_a"):
    auth(client, users, "teacher")
    response = client.post(f'/teacher/groups/{group["id"]}/invitations', json={"login": student})
    assert response.status_code == 201, response.text
    return response.json()


def code(client, users, group, value=1, unit="hours"):
    auth(client, users, "teacher")
    response = client.post(f'/teacher/groups/{group["id"]}/invitation-code', json={"value": value, "unit": unit})
    assert response.status_code == 200, response.text
    return response.json()


def test_search_requires_query_and_returns_only_student_id_login(client, users, group):
    path = f'/teacher/groups/{group["id"]}/students/search'
    for q in (None, "", " "):
        assert client.get(path, params={} if q is None else {"q": q}).status_code == 422
    result = client.get(path, params={"q": "STUDENT_"})
    assert result.status_code == 200
    assert {item["login"] for item in result.json()} == {"student_a", "student_b"}
    assert all(set(item) == {"id", "login"} for item in result.json())
    assert client.get(path, params={"q": "teacher"}).json() == []
    assert client.get(path, params={"q": "%"}).json() == []
    assert client.get(path, params={"q": "inactive"}).json() == []


def test_invite_does_not_add_member_until_accepted_and_counts_pending(client, users, group):
    item = invite(client, users, group)
    path = f'/teacher/groups/{group["id"]}'
    assert item["status"] == "PENDING"
    assert client.get(path + "/members").json() == []
    assert client.get(path).json()["pending_invitation_count"] == 1
    assert client.post(path + "/invitations", json={"login": "student_a"}).status_code == 409
    assert client.post(path + "/invitations", json={"login": "teacher"}).status_code == 404
    assert client.post(path + "/invitations", json={"login": "missing"}).status_code == 404
    assert client.post(path + "/invitations", json={"login": "inactive"}).status_code == 404
    auth(client, users, "student_b")
    assert client.get("/student/group-invitations").json() == []
    assert client.post(f'/student/group-invitations/{item["id"]}/accept').status_code == 404
    assert client.post(f'/student/group-invitations/{item["id"]}/reject').status_code == 404
    auth(client, users, "student_a")
    pending = client.get("/student/group-invitations").json()
    assert item in pending
    assert "code" not in str(pending)
    assert client.get(f'/student/groups/{group["id"]}').status_code == 404
    assert client.post(f'/student/group-invitations/{item["id"]}/accept').status_code == 204
    assert client.post(f'/student/group-invitations/{item["id"]}/accept').status_code == 409
    assert client.get(f'/student/groups/{group["id"]}').json()["student_count"] == 1
    assert any(g["id"] == group["id"] for g in client.get("/student/groups").json())
    auth(client, users, "teacher")
    assert client.get(path).json()["pending_invitation_count"] == 0
    assert client.get(path + "/members").json() == [{"id": users["student_a"], "login": "student_a"}]
    assert client.post(path + "/invitations", json={"login": "student_a"}).status_code == 409


def test_rejection_cancellation_and_reinviting(client, users, group, db_engine):
    item = invite(client, users, group)
    auth(client, users, "student_a")
    assert client.post(f'/student/group-invitations/{item["id"]}/reject').status_code == 204
    assert client.get(f'/student/groups/{group["id"]}').status_code == 404
    with Session(db_engine) as db:
        assert db.get(GroupInvitation, item["id"]).status == "REJECTED"
    second = invite(client, users, group)
    assert second["id"] != item["id"]
    assert client.delete(f'/teacher/groups/{group["id"]}/invitations/{second["id"]}').status_code == 204
    auth(client, users, "student_a")
    assert client.post(f'/student/group-invitations/{second["id"]}/accept').status_code == 404


def test_owner_isolation_for_all_group_operations(client, users, group):
    item = invite(client, users, group)
    code(client, users, group)
    auth(client, users, "other_teacher")
    path = f'/teacher/groups/{group["id"]}'
    for method, suffix, data in [("GET", "/students/search?q=student", None), ("GET", "/members", None),
        ("DELETE", f'/members/{users["student_a"]}', None), ("GET", "/invitations", None),
        ("POST", "/invitations", {"login": "student_b"}), ("DELETE", f'/invitations/{item["id"]}', None),
        ("GET", "/invitation-code", None), ("POST", "/invitation-code", {"value": 1, "unit": "hours"})]:
        assert client.request(method, path + suffix, json=data).status_code == 404


@pytest.mark.parametrize("value,unit,hours", [(1, "hours", 1), (12, "hours", 12), (1, "days", 24), (30, "days", 720), (720, "hours", 720)])
def test_validity_boundaries_and_server_time(client, users, group, monkeypatch, value, unit, hours):
    now = datetime(2026, 11, 9, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(groups, "utc_now", lambda: now)
    generated = code(client, users, group, value, unit)
    assert datetime.fromisoformat(generated["created_at"].replace("Z", "+00:00")) == now
    assert datetime.fromisoformat(generated["expires_at"].replace("Z", "+00:00")) == now + timedelta(hours=hours)
    assert generated["code"] != str(group["id"])
    assert len(generated["code"]) >= 20
    assert client.get(f'/teacher/groups/{group["id"]}/invitation-code').json() == generated
    auth(client, users, "student_a")
    assert client.post("/student/groups/join", json={"code": generated["code"]}).status_code == 200
    assert client.post("/student/groups/join", json={"code": generated["code"]}).status_code == 409


@pytest.mark.parametrize("payload", [{"value": 0, "unit": "hours"}, {"value": -1, "unit": "days"},
    {"value": 31, "unit": "days"}, {"value": 721, "unit": "hours"}, {"value": 0.5, "unit": "hours"},
    {"value": "1", "unit": "hours"}, {"value": True, "unit": "hours"}, {"value": 1, "unit": "weeks"},
    {"value": 1, "unit": "hours", "expires_at": "2099-01-01"}])
def test_invalid_validity_is_rejected(client, users, group, payload):
    path = f'/teacher/groups/{group["id"]}/invitation-code'
    assert client.post(path, json=payload).status_code == 422
    assert client.get(path).json() is None


def test_invalid_expired_and_regenerated_codes(client, users, group, monkeypatch):
    now = datetime(2026, 11, 9, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(groups, "utc_now", lambda: now)
    first = code(client, users, group)
    monkeypatch.setattr(groups, "utc_now", lambda: now + timedelta(hours=1))
    auth(client, users, "student_a")
    assert client.post("/student/groups/join", json={"code": "invalid"}).status_code == 404
    assert client.post("/student/groups/join", json={"code": first["code"]}).status_code == 410
    next_code = code(client, users, group, 30, "days")
    assert next_code["code"] != first["code"]
    auth(client, users, "student_a")
    assert client.post("/student/groups/join", json={"code": first["code"]}).status_code == 404
    assert client.post("/student/groups/join", json={"code": next_code["code"]}).status_code == 200


def test_code_join_resolves_pending_invitation_and_member_can_leave_or_be_removed(client, users, group):
    item = invite(client, users, group)
    generated = code(client, users, group)
    auth(client, users, "student_a")
    assert client.post("/student/groups/join", json={"code": generated["code"]}).status_code == 200
    assert all(i["id"] != item["id"] for i in client.get("/student/group-invitations").json())
    assert client.delete(f'/student/groups/{group["id"]}/membership').status_code == 204
    assert client.get(f'/student/groups/{group["id"]}').status_code == 404
    assert client.post("/student/groups/join", json={"code": generated["code"]}).status_code == 200
    auth(client, users, "teacher")
    assert client.delete(f'/teacher/groups/{group["id"]}/members/{users["student_a"]}').status_code == 204
    assert client.get(f'/teacher/groups/{group["id"]}/members').json() == []


@pytest.mark.parametrize("name,expected", [(None, 401), ("student_a", 403), ("admin", 403), ("pending", 403), ("inactive", 403)])
def test_teacher_endpoints_rbac(client, users, group, name, expected):
    auth(client, users, name)
    path = f'/teacher/groups/{group["id"]}'
    for method, suffix, payload in [("GET", "/students/search?q=student", None), ("GET", "/members", None),
        ("GET", "/invitations", None), ("POST", "/invitations", {"login": "student_a"}),
        ("DELETE", "/invitations/1", None), ("DELETE", "/members/1", None),
        ("GET", "/invitation-code", None), ("POST", "/invitation-code", {"value": 1, "unit": "hours"})]:
        assert client.request(method, path + suffix, json=payload).status_code == expected


@pytest.mark.parametrize("name,expected", [(None, 401), ("teacher", 403), ("admin", 403), ("inactive", 403)])
def test_student_endpoints_rbac(client, users, group, name, expected):
    auth(client, users, name)
    for method, path, payload in [("GET", "/student/groups", None), ("GET", "/student/group-invitations", None),
        ("POST", "/student/groups/join", {"code": "test"}), ("GET", f'/student/groups/{group["id"]}', None),
        ("POST", "/student/group-invitations/1/accept", None), ("POST", "/student/group-invitations/1/reject", None),
        ("DELETE", f'/student/groups/{group["id"]}/membership', None)]:
        assert client.request(method, path, json=payload).status_code == expected


def test_database_pending_uniqueness_and_group_cascade(client, users, group, db_engine):
    item = invite(client, users, group)
    code(client, users, group)
    with Session(db_engine) as db:
        db.add(GroupInvitation(group_id=group["id"], student_id=users["student_a"], invited_by_teacher_id=users["teacher"]))
        with pytest.raises(IntegrityError): db.commit()
        db.rollback()
    assert client.delete(f'/teacher/groups/{group["id"]}').status_code == 204
    with Session(db_engine) as db:
        assert db.get(GroupInvitation, item["id"]) is None
        assert db.get(GroupInvitationCode, group["id"]) is None


def test_concurrent_invitations_are_serialized(client, users, group, db_engine):
    def send():
        with Session(db_engine) as db:
            try:
                groups.invite_student(db, group["id"], users["teacher"], "student_a")
                return 201
            except HTTPException as exc:
                return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(lambda _: send(), range(2))) == [201, 409]


def test_concurrent_code_join_and_invite_accept_create_one_membership(client, users, group, db_engine):
    item = invite(client, users, group)
    generated = code(client, users, group)
    def mutate(join):
        with Session(db_engine) as db:
            try:
                if join: groups.join_by_code(db, users["student_a"], generated["code"])
                else: groups.respond_to_invitation(db, item["id"], users["student_a"], True)
                return 200
            except HTTPException as exc: return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(mutate, [False, True])) == [200, 409]
    with Session(db_engine) as db:
        assert db.scalar(select(func.count()).select_from(group_students).where(group_students.c.group_id == group["id"])) == 1
        assert db.get(GroupInvitation, item["id"]).status == "ACCEPTED"


def test_origin_protection(client, users, group):
    path = f'/teacher/groups/{group["id"]}'
    headers = {"Origin": "https://untrusted.example"}
    assert client.post(path + "/invitations", json={"login": "student_a"}, headers=headers).status_code == 403
    assert client.post(path + "/invitation-code", json={"value": 1, "unit": "hours"}, headers=headers).status_code == 403
    auth(client, users, "student_a")
    assert client.post("/student/groups/join", json={"code": "test"}, headers=headers).status_code == 403
