"""Real PostgreSQL tests; only a disposable *_test database is accepted by fixtures."""
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.api.dependencies import require_role
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password
from app.models.user import AccountStatus, TeacherApproval, User, UserRole


@pytest.fixture(scope="module")
def users(client, db_engine):
    ids = {}
    with Session(db_engine) as db:
        for role, name, status, approval in [
            (UserRole.ADMIN, "admin", AccountStatus.ACTIVE, None),
            (UserRole.STUDENT, "student", AccountStatus.ACTIVE, None),
            (UserRole.TEACHER, "pending", AccountStatus.ACTIVE, TeacherApproval.PENDING),
            (UserRole.TEACHER, "approved", AccountStatus.ACTIVE, TeacherApproval.APPROVED),
            (UserRole.TEACHER, "rejected", AccountStatus.ACTIVE, TeacherApproval.REJECTED),
            (UserRole.ADMIN, "inactive_admin", AccountStatus.INACTIVE, None),
        ]:
            user = User(login=name, email=f"{name}@example.com", role=role, status=status,
                        teacher_approval=approval, password_hash=hash_password("ExamplePassword123!"))
            db.add(user)
            db.flush()
            ids[name] = user.id
        db.commit()
    return ids


@pytest.fixture
def admin(client, users):
    client.cookies.clear()
    client.cookies.set(get_settings().cookie_name, create_access_token(users["admin"]))
    yield client
    client.cookies.clear()


@pytest.fixture(autouse=True)
def reset_users(users, db_engine):
    """Keep scenarios independent inside the disposable test DB."""
    with Session(db_engine) as db:
        db.execute(delete(User).where(User.id.not_in(list(users.values()))))
        for name, user_id in users.items():
            user = db.get(User, user_id)
            user.login = name
            user.email = f"{name}@example.com"
            user.status = AccountStatus.INACTIVE if name == "inactive_admin" else AccountStatus.ACTIVE
            user.teacher_approval = {"pending": TeacherApproval.PENDING, "approved": TeacherApproval.APPROVED,
                                     "rejected": TeacherApproval.REJECTED}.get(name)
        db.commit()


@pytest.mark.parametrize("method,path,payload", [
    ("GET", "", None), ("GET", "/1", None), ("PATCH", "/1", {"login": "changed"}),
    ("POST", "/1/activate", None), ("POST", "/1/deactivate", None),
    ("POST", "/1/approve-teacher", None), ("POST", "/1/reject-teacher", None), ("POST", "/1/revoke-teacher", None),
])
@pytest.mark.parametrize("identity,expected", [(None, 401), ("student", 403), ("pending", 403),
                                              ("approved", 403), ("rejected", 403), ("inactive_admin", 403)])
def test_all_admin_endpoints_enforce_access(client, users, method, path, payload, identity, expected):
    client.cookies.clear()
    if identity:
        client.cookies.set(get_settings().cookie_name, create_access_token(users[identity]))
    assert client.request(method, f"/admin/users{path}", json=payload).status_code == expected


@pytest.mark.parametrize("query,expected", [("TuDeN", ["student"]),
    ("ENDING@EXAMPLE", ["pending"]), ("  approved  ", ["approved"]),
    ("_", ["inactive_admin"]), ("%", []), ("missing-user", []),
    ("   ", ["admin", "student", "pending", "approved", "rejected", "inactive_admin"])])
def test_search_login_and_email(admin, query, expected):
    result = admin.get("/admin/users", params={"q": query}).json()
    assert sorted(user["login"] for user in result["items"]) == sorted(expected)
    assert result["total"] == len(expected)


def test_search_combines_filters_and_pagination(admin, users):
    result = admin.get("/admin/users", params={"q": "example.com", "role": "TEACHER",
                       "status": "ACTIVE", "teacher_approval": "PENDING", "limit": 1}).json()
    assert result["total"] == 1 and result["items"][0]["id"] == users["pending"]
    assert admin.get("/admin/users", params={"q": "example.com", "role": "TEACHER", "offset": 2, "limit": 1}).json()["total"] == 3
    assert admin.get("/admin/users", params={"q": "x" * 255}).status_code == 422


def test_list_detail_and_filters(admin, users):
    result = admin.get("/admin/users").json()
    assert result["total"] == 6
    assert len(result["items"]) == 6
    assert all("password_hash" not in item and "password" not in item for item in result["items"])
    teachers = admin.get("/admin/users", params={"role": "TEACHER"}).json()
    assert teachers["total"] == 3
    assert all(item["role"] == "TEACHER" for item in teachers["items"])
    pending = admin.get("/admin/users", params={"role": "TEACHER", "status": "ACTIVE", "teacher_approval": "PENDING"}).json()
    assert [item["id"] for item in pending["items"]] == [users["pending"]]
    inactive = admin.get("/admin/users", params={"status": "INACTIVE"}).json()
    assert inactive["total"] == 1
    assert admin.get("/admin/users", params={"role": "STUDENT", "teacher_approval": "PENDING"}).json()["items"] == []
    first = admin.get("/admin/users", params={"limit": 2}).json()
    second = admin.get("/admin/users", params={"limit": 2, "offset": 2}).json()
    assert len(first["items"]) == len(second["items"]) == 2
    assert not {u["id"] for u in first["items"]} & {u["id"] for u in second["items"]}
    detail = admin.get(f"/admin/users/{users['pending']}")
    assert detail.status_code == 200
    assert detail.headers["cache-control"] == "no-store"
    assert detail.json()["teacher_approval"] == "PENDING"


@pytest.mark.parametrize("params", [{"role": "OWNER"}, {"status": "UNKNOWN"},
                                    {"teacher_approval": "UNKNOWN"}, {"limit": 101}, {"offset": -1}])
def test_invalid_filters(admin, params):
    assert admin.get("/admin/users", params=params).status_code == 422


def test_edit_identity_and_validation(admin, users):
    path = f"/admin/users/{users['student']}"
    result = admin.patch(path, json={"login": " Student.Edited ", "email": " STUDENT@EXAMPLE.ORG "})
    assert result.status_code == 200
    assert result.json()["login"] == "student.edited"
    assert result.json()["email"] == "student@example.org"
    assert admin.patch(path, json={"email": None}).json()["email"] is None
    assert admin.patch(path, json={"login": "admin"}).status_code == 409
    assert admin.patch(path, json={"email": "pending@example.com"}).status_code == 409
    for payload in [{"role": "ADMIN"}, {"role": "TEACHER"}, {"status": "ACTIVE"},
                    {"teacher_approval": "APPROVED"}, {"password": "changed"}, {}, {"login": None},
                    {"email": "invalid"}, {"login": "a"}]:
        assert admin.patch(path, json=payload).status_code == 422
    assert admin.get(path).json()["role"] == "STUDENT"
    assert admin.patch(f"/admin/users/{users['pending']}", json={"email": None}).status_code == 422


def test_state_actions_and_preserved_approval(admin, users):
    student = f"/admin/users/{users['student']}"
    assert admin.post(student + "/deactivate").json()["status"] == "INACTIVE"
    assert admin.post(student + "/deactivate").status_code == 200  # idempotent
    assert admin.post(student + "/activate").json()["status"] == "ACTIVE"
    teacher = f"/admin/users/{users['pending']}"
    assert admin.post(teacher + "/deactivate").json()["teacher_approval"] == "PENDING"
    assert admin.post(teacher + "/activate").json()["teacher_approval"] == "PENDING"
    assert admin.post(teacher + "/reject-teacher").json()["teacher_approval"] == "REJECTED"
    assert admin.post(teacher + "/activate").json()["teacher_approval"] == "REJECTED"
    assert admin.post(teacher + "/deactivate").status_code == 200
    approved = admin.post(teacher + "/approve-teacher").json()
    assert approved["teacher_approval"] == "APPROVED" and approved["status"] == "INACTIVE"
    assert admin.post(teacher + "/activate").json()["teacher_approval"] == "APPROVED"
    assert admin.post(teacher + "/reject-teacher").json()["teacher_approval"] == "REJECTED"


@pytest.mark.parametrize("action", ["approve-teacher", "reject-teacher", "revoke-teacher"])
def test_teacher_actions_reject_other_roles(admin, users, action):
    for identity in ["student", "admin"]:
        assert admin.post(f"/admin/users/{users[identity]}/{action}").status_code == 409


def test_self_deactivation_is_blocked(admin, users):
    assert admin.post(f"/admin/users/{users['admin']}/deactivate").status_code == 409
    assert admin.get("/auth/me").json()["status"] == "ACTIVE"


@pytest.mark.parametrize("method,suffix,payload", [("GET", "", None), ("PATCH", "", {"login": "valid"}),
    ("POST", "/activate", None), ("POST", "/deactivate", None),
    ("POST", "/approve-teacher", None), ("POST", "/reject-teacher", None), ("POST", "/revoke-teacher", None)])
def test_missing_user(admin, method, suffix, payload):
    assert admin.request(method, f"/admin/users/999999{suffix}", json=payload).status_code == 404


def test_write_origin_and_patch_cors(admin, users):
    path = f"/admin/users/{users['student']}"
    assert admin.patch(path, json={"login": "valid"}, headers={"Origin": "https://evil.example"}).status_code == 403
    for action in ["activate", "deactivate", "approve-teacher", "reject-teacher", "revoke-teacher"]:
        assert admin.post(path + "/" + action, headers={"Origin": "https://evil.example"}).status_code == 403
    result = admin.options(path, headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "content-type"})
    assert result.status_code == 200
    assert result.headers["access-control-allow-credentials"] == "true"
    assert "PATCH" in result.headers["access-control-allow-methods"]


def test_registration_status_and_restricted_sessions(client, users):
    client.cookies.clear()
    password = "ExamplePassword123!"
    for role in ["STUDENT", "TEACHER"]:
        data = {"login": f"new_{role.lower()}", "password": password, "role": role}
        if role == "TEACHER":
            data["email"] = "new_teacher@example.com"
        registered = client.post("/auth/register", json=data)
        assert registered.status_code == 201
        assert registered.json()["status"] == "ACTIVE"
        assert registered.json()["teacher_approval"] == ("PENDING" if role == "TEACHER" else None)
        assert client.post("/auth/login", json={"login": data["login"], "password": password}).status_code == 200
        assert client.get("/auth/me").json()["status"] == "ACTIVE"
        assert client.post("/auth/logout").status_code == 204
    assert client.post("/auth/register", json={"login": "new_admin", "password": password, "role": "ADMIN"}).status_code == 422
    for name in ["pending", "rejected", "inactive_admin"]:
        assert client.post("/auth/login", json={"login": name, "password": password}).status_code == 200
        assert client.get("/auth/me").status_code == 200  # metadata, not full role access
        assert client.get("/admin/users").status_code == 403
        assert client.post("/auth/logout").status_code == 204


def test_existing_cookie_respects_db_changes(admin, users):
    token = create_access_token(users["student"])
    # Test-only endpoint uses the production role guard, not a production business API.
    from fastapi import FastAPI
    from app.db.session import get_db
    app = FastAPI()
    app.dependency_overrides[get_db] = admin.app.dependency_overrides[get_db]

    @app.get("/protected", dependencies=[Depends(require_role(UserRole.STUDENT))])
    def protected():
        return {"ok": True}

    with TestClient(app) as client:
        client.cookies.set(get_settings().cookie_name, token)
        assert client.get("/protected").status_code == 200
        assert admin.post(f"/admin/users/{users['student']}/deactivate").status_code == 200
        assert client.get("/protected").status_code == 403
        assert admin.post(f"/admin/users/{users['student']}/activate").status_code == 200
        assert client.get("/protected").status_code == 200


def test_teacher_cookie_respects_approval_and_activation(admin, users):
    from fastapi import FastAPI
    from app.db.session import get_db
    app = FastAPI()
    app.dependency_overrides[get_db] = admin.app.dependency_overrides[get_db]

    @app.get("/protected", dependencies=[Depends(require_role(UserRole.TEACHER))])
    def protected():
        return {"ok": True}

    path = f"/admin/users/{users['pending']}"
    with TestClient(app) as client:
        client.cookies.set(get_settings().cookie_name, create_access_token(users["pending"]))
        assert client.get("/protected").status_code == 403
        assert admin.post(path + "/activate").status_code == 200
        assert client.get("/protected").status_code == 403
        assert admin.post(path + "/approve-teacher").status_code == 200
        assert client.get("/protected").status_code == 200
        assert admin.post(path + "/deactivate").status_code == 200
        assert admin.post(path + "/approve-teacher").status_code == 200
        assert client.get("/protected").status_code == 403
        assert admin.post(path + "/activate").status_code == 200
        assert client.get("/protected").status_code == 200
        revoked = admin.post(path + "/revoke-teacher")
        assert revoked.status_code == 200
        assert revoked.json()["teacher_approval"] == "PENDING"
        assert revoked.json()["status"] == "ACTIVE"
        assert client.get("/protected").status_code == 403
        assert admin.post(path + "/approve-teacher").status_code == 200
        assert client.get("/protected").status_code == 200
        assert admin.post(path + "/reject-teacher").status_code == 200
        assert client.get("/protected").status_code == 403
