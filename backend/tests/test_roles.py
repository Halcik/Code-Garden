"""Exercise guards through FastAPI without adding production business endpoints."""
from types import SimpleNamespace

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user, require_role
from app.core.config import get_settings
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import AccountStatus, TeacherApproval, UserRole


@pytest.fixture
def client():
    app = FastAPI()
    users = {index: SimpleNamespace(id=index, role=role, status=AccountStatus.ACTIVE,
                                   teacher_approval=TeacherApproval.APPROVED if role == UserRole.TEACHER else None)
             for index, role in enumerate(UserRole, start=1)}

    class FakeSession:
        def get(self, model, user_id):
            return users.get(user_id)

    app.dependency_overrides[get_db] = lambda: FakeSession()
    for role in UserRole:
        def panel(user=Depends(require_role(role))):
            return {"role": user.role}
        app.add_api_route(f"/{role.value.lower()}", panel)

    @app.get("/shared", dependencies=[Depends(require_role(UserRole.STUDENT, UserRole.TEACHER))])
    def shared():
        return {"ok": True}

    with TestClient(app) as test_client:
        yield test_client


@pytest.mark.parametrize("user_id,role", list(enumerate(UserRole, start=1)))
@pytest.mark.parametrize("target", list(UserRole))
def test_strict_role_access(client, user_id, role, target):
    client.cookies.set(get_settings().cookie_name, create_access_token(user_id))
    response = client.get(f"/{target.value.lower()}")
    assert response.status_code == (200 if role == target else 403)
    if response.status_code == 200:
        assert response.json() == {"role": role.value}


@pytest.mark.parametrize("token", [None, "invalid", create_access_token(999)])
@pytest.mark.parametrize("target", list(UserRole))
def test_unauthenticated_access(client, token, target):
    if token:
        client.cookies.set(get_settings().cookie_name, token)
    assert client.get(f"/{target.value.lower()}").status_code == 401


@pytest.mark.parametrize("user_id,expected", [(1, 200), (2, 200), (3, 403)])
def test_explicit_multiple_roles(client, user_id, expected):
    client.cookies.set(get_settings().cookie_name, create_access_token(user_id))
    assert client.get("/shared").status_code == expected


def test_guard_uses_current_user_role(client):
    user = SimpleNamespace(role=UserRole.STUDENT, status=AccountStatus.ACTIVE,
                           teacher_approval=TeacherApproval.APPROVED)
    client.app.dependency_overrides[get_current_user] = lambda: user
    assert client.get("/student").status_code == 200
    user.role = UserRole.TEACHER
    assert client.get("/student").status_code == 403
    assert client.get("/teacher").status_code == 200


@pytest.mark.parametrize("roles", [(), ("STUDENT",)])
def test_guard_rejects_invalid_configuration(roles):
    with pytest.raises(ValueError):
        require_role(*roles)


@pytest.mark.parametrize("role", list(UserRole))
def test_inactive_user_blocked_with_existing_session(client, role):
    user = SimpleNamespace(role=role, status=AccountStatus.ACTIVE,
                           teacher_approval=TeacherApproval.APPROVED)
    client.app.dependency_overrides[get_current_user] = lambda: user
    assert client.get(f"/{role.value.lower()}").status_code == 200
    user.status = AccountStatus.INACTIVE
    assert client.get(f"/{role.value.lower()}").status_code == 403


@pytest.mark.parametrize("approval", list(TeacherApproval))
@pytest.mark.parametrize("status", list(AccountStatus))
def test_teacher_access_requires_both_status_and_approval(client, approval, status):
    client.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        role=UserRole.TEACHER, status=status, teacher_approval=approval)
    expected = 200 if status == AccountStatus.ACTIVE and approval == TeacherApproval.APPROVED else 403
    assert client.get("/teacher").status_code == expected
