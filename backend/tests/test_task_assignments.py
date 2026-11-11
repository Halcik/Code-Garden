"""KAN-45 API, database constraints and student access on PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token
from app.main import app
from app.models.group import StudentGroup
from app.models.task import Task, TaskDifficulty, TaskStatus, TaskType
from app.models.task_assignment import TaskAssignment
from app.models.user import AccountStatus, TeacherApproval, User, UserRole


def login(client, user_id):
    client.cookies.clear()
    if user_id:
        client.cookies.set(get_settings().cookie_name, create_access_token(user_id))


@pytest.fixture
def data(client, db_engine):
    suffix = uuid4().hex[:10]
    ids = {}
    with Session(db_engine) as db:
        users = {}
        for name, role in [("teacher", UserRole.TEACHER), ("other_teacher", UserRole.TEACHER),
                           ("student", UserRole.STUDENT), ("second", UserRole.STUDENT),
                           ("outsider", UserRole.STUDENT), ("foreign", UserRole.STUDENT),
                           ("admin", UserRole.ADMIN), ("pending", UserRole.TEACHER),
                           ("inactive", UserRole.TEACHER)]:
            user = User(login=f"{name}_{suffix}", email=f"{name}_{suffix}@example.com", role=role,
                password_hash="unused", status=AccountStatus.INACTIVE if name == "inactive" else AccountStatus.ACTIVE,
                teacher_approval=(TeacherApproval.PENDING if name == "pending" else TeacherApproval.APPROVED)
                if role == UserRole.TEACHER else None)
            db.add(user); db.flush(); ids[name] = user.id; users[name] = user
        for name, teacher, students in [("group", "teacher", ["student", "second"]),
                ("overlap", "teacher", ["student"]), ("empty", "teacher", []),
                ("foreign_group", "other_teacher", ["foreign"])]:
            group = StudentGroup(name=f"{name}_{suffix}", teacher_id=ids[teacher],
                                 students=[users[student] for student in students])
            db.add(group); db.flush(); ids[name] = group.id
        for name, author, status, archived in [("task", "teacher", TaskStatus.READY, False),
                ("other_task", "other_teacher", TaskStatus.READY, False),
                ("second_task", "teacher", TaskStatus.READY, False),
                ("draft", "teacher", TaskStatus.DRAFT, False),
                ("archived", "teacher", TaskStatus.READY, True)]:
            task = Task(title=name, topic=suffix, instructions="Solve", author_id=ids[author],
                status=status, is_archived=archived, difficulty=TaskDifficulty.EASY, task_type=TaskType.STANDARD)
            db.add(task); db.flush(); ids[name] = task.id
        db.commit()
    login(client, ids["teacher"])
    return ids


def assign(client, data, student="student", task="task"):
    return client.post(f"/teacher/tasks/{data[task]}/assignments", json={"student_id": data[student]})


def assign_group(client, data, group="group"):
    return client.post(f"/teacher/tasks/{data['task']}/group-assignments", json={"group_id": data[group]})


def test_individual_assignment_and_deduplicated_member_search(client, db_engine, data):
    response = client.get("/teacher/assignment-students")
    assert response.headers["cache-control"] == "no-store"
    assert {row["id"] for row in response.json()} == {data["student"], data["second"]}
    assert len(response.json()) == 2  # student belongs to two groups
    login_name = next(row["login"] for row in response.json() if row["id"] == data["student"])
    assert len(client.get("/teacher/assignment-students", params={"q": login_name.upper()}).json()) == 1
    assert client.get("/teacher/assignment-students?q=%25").json() == []
    response = assign(client, data)
    assert response.status_code == 201
    row = response.json()
    assert row["student_id"] == data["student"] and row["task_id"] == data["task"]
    assert row["assigned_by_teacher_id"] == data["teacher"]
    assert row["group_id"] is None and row["created_at"]
    assert assign(client, data).status_code == 409
    with Session(db_engine) as db:
        assert db.scalar(select(func.count()).select_from(TaskAssignment).where(
            TaskAssignment.task_id == data["task"])) == 1
        with pytest.raises(IntegrityError):
            db.add(TaskAssignment(task_id=data["task"], student_id=data["student"], assigned_by_teacher_id=data["teacher"]))
            db.commit()
        db.rollback()


@pytest.mark.parametrize("student,expected", [("outsider", 403), ("foreign", 403),
                                            ("teacher", 422), ("admin", 422)])
def test_recipient_validation(client, data, student, expected):
    assert assign(client, data, student).status_code == expected


@pytest.mark.parametrize("task", ["draft", "archived", "missing"])
def test_unavailable_task(client, data, task):
    data["missing"] = 2147483647
    response = assign(client, data, task=task)
    assert response.status_code == 404
    assert response.json()["detail"] == "Task unavailable for assignment"
    assert client.post(f"/teacher/tasks/{data[task]}/group-assignments", json={"group_id": data["group"]}).status_code == 404


def test_only_task_author_can_assign_ready_tasks_to_students_or_groups(client, data, db_engine):
    assert assign(client, data).status_code == 201
    assert assign(client, data, task="other_task").status_code == 404
    assert client.post(f"/teacher/tasks/{data['other_task']}/group-assignments",
                       json={"group_id": data["group"]}).status_code == 404
    with Session(db_engine) as db:
        assert db.scalar(select(func.count()).select_from(TaskAssignment).where(
            TaskAssignment.task_id == data["other_task"])) == 0
    login(client, data["other_teacher"])
    assert assign(client, data, student="foreign", task="other_task").status_code == 201
    assert assign(client, data, student="foreign").status_code == 404
    assert client.post(f"/teacher/tasks/{data['task']}/group-assignments",
                       json={"group_id": data["foreign_group"]}).status_code == 404


def test_group_snapshot_skips_duplicates_and_preserves_original_assignment(client, data, db_engine):
    direct = assign(client, data).json()
    response = assign_group(client, data)
    assert response.status_code == 200
    assert response.json() == {"total_students": 2, "assigned_count": 2, "already_assigned_count": 0}
    rows = client.get(f"/teacher/tasks/{data['task']}/assignments").json()
    assert len(rows) == 3
    assert next(row for row in rows if row["id"] == direct["id"]) == direct
    group_row = next(row for row in rows if row["student_id"] == data["second"])
    assert group_row["group_id"] == data["group"] and group_row["group_name"]
    assert group_row["assigned_by_teacher_id"] == data["teacher"]
    assert assign_group(client, data).json()["assigned_count"] == 0
    assert assign_group(client, data, "overlap").json()["assigned_count"] == 1
    with Session(db_engine) as db:
        group = db.get(StudentGroup, data["group"])
        group.students.append(db.get(User, data["outsider"]))
        db.commit()
        assert db.scalar(select(TaskAssignment.id).where(TaskAssignment.task_id == data["task"],
            TaskAssignment.student_id == data["outsider"])) is None
    login(client, data["outsider"])
    assert data["task"] not in [item["id"] for item in client.get("/student/tasks?view=assigned").json()["items"]]
    # Deleting a group leaves individual assignments intact.
    login(client, data["teacher"])
    assert client.delete(f"/teacher/groups/{data['group']}").status_code == 204
    assert len(client.get(f"/teacher/tasks/{data['task']}/assignments").json()) == 4


def test_group_ownership_and_empty_group(client, data):
    assert assign_group(client, data, "foreign_group").status_code == 404
    assert assign_group(client, data, "empty").json() == {
        "total_students": 0, "assigned_count": 0, "already_assigned_count": 0}


def test_teacher_assignment_history_is_private(client, data):
    assert assign(client, data).status_code == 201
    login(client, data["other_teacher"])
    assert client.get(f"/teacher/tasks/{data['task']}/assignments").status_code == 404


def test_student_only_sees_own_assigned_tasks(client, data):
    assert assign(client, data).status_code == 201
    assert assign(client, data, "second", "second_task").status_code == 201
    login(client, data["student"])
    page = client.get("/student/tasks").json()
    assert [item["id"] for item in page["items"]] == [data["task"]]
    assert page["progress_counts"] == {"NOT_STARTED": 1, "IN_PROGRESS": 0, "COMPLETED": 0}
    assert client.get(f"/student/tasks/{data['task']}").status_code == 200
    assert client.get(f"/student/tasks/{data['other_task']}").status_code == 200


def test_catalogue_includes_unassigned_ready_tasks_and_keeps_practice_private(client, data, db_engine):
    assert assign(client, data).status_code == 201
    login(client, data["outsider"])
    assert client.get("/student/tasks?view=assigned").json()["items"] == []
    with Session(db_engine) as db:
        topic = db.get(Task, data["task"]).topic
    page = client.get("/student/tasks", params={"view": "catalog", "topic": topic}).json()
    assert {item["id"] for item in page["items"]} == {data["task"], data["other_task"], data["second_task"]}
    assert client.get(f"/student/tasks/{data['task']}").status_code == 200
    assert client.put(f"/student/tasks/{data['task']}/draft", json={"source_code": "my catalogue solution"}).status_code == 200
    login(client, data["student"])
    assert client.get(f"/student/tasks/{data['task']}/draft").json()["source_code"] != "my catalogue solution"
    assert client.get("/student/tasks?view=unknown").status_code == 422


@pytest.mark.parametrize("method,suffix,payload", [
    ("GET", "", None), ("GET", "/draft", None), ("GET", "/hints", None),
    ("GET", "/hints/1", None), ("GET", "/revealed-hints", None),
    ("PUT", "/draft", {"source_code": "x"}), ("POST", "/hints/1/reveal", None),
    ("POST", "/run", {"source_code": "x"}), ("POST", "/check", {"source_code": "x"}),
    ("POST", "/submissions", {"revision": 0}),
])
def test_draft_task_cannot_be_accessed_through_any_student_operation(client, data, method, suffix, payload):
    login(client, data["student"])
    assert client.request(method, f"/student/tasks/{data['draft']}{suffix}", json=payload).status_code == 404


@pytest.mark.parametrize("actor,expected", [(None, 401), ("student", 403), ("admin", 403),
                                         ("pending", 403), ("inactive", 403)])
def test_rbac_on_all_assignment_endpoints(client, data, actor, expected):
    login(client, data[actor] if actor else None)
    for method, path, payload in [
        ("GET", "/teacher/assignment-students", None),
        ("GET", f"/teacher/tasks/{data['task']}/assignments", None),
        ("POST", f"/teacher/tasks/{data['task']}/assignments", {"student_id": data["student"]}),
        ("POST", f"/teacher/tasks/{data['task']}/group-assignments", {"group_id": data["group"]}),
    ]:
        assert client.request(method, path, json=payload).status_code == expected


def test_origin_and_privileged_fields(client, data):
    for suffix, payload in [("assignments", {"student_id": data["student"]}),
                            ("group-assignments", {"group_id": data["group"]})]:
        url = f"/teacher/tasks/{data['task']}/{suffix}"
        assert client.post(url, json=payload, headers={"Origin": "https://untrusted.example"}).status_code == 403
        assert client.post(url, json={**payload, "assigned_by_teacher_id": data["other_teacher"]}).status_code == 422


def test_concurrent_assignments_create_one_row(client, data, db_engine):
    def send(_):
        with TestClient(app) as concurrent:
            login(concurrent, data["teacher"])
            return assign(concurrent, data).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(send, range(2))) == [201, 409]


def test_group_list_and_removal_preserve_other_sources_and_student_work(client, data, db_engine):
    from app.models.solution import SolutionDraft, Submission
    direct = assign(client, data).json()
    assert assign_group(client, data).json()["assigned_count"] == 2
    path = f"/teacher/groups/{data['group']}/task-assignments"
    response = client.get(path)
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["task_id"] == data["task"] and rows[0]["student_count"] == 2
    assert rows[0]["title"] == "task" and rows[0]["created_at"]
    # Source remains authoritative after a recipient leaves and the task is archived.
    with Session(db_engine) as db:
        group = db.get(StudentGroup, data["group"])
        group.students.remove(db.get(User, data["second"]))
        db.get(Task, data["task"]).is_archived = True
        db.add(SolutionDraft(task_id=data["task"], student_id=data["second"], source_code="saved"))
        db.add(Submission(task_id=data["task"], student_id=data["second"], version=1, source_code="saved", summary={}))
        db.commit()
    assert client.get(path).json()[0]["is_archived"] is True
    assert client.delete(f"{path}/{data['other_task']}").status_code == 204
    assert len(client.get(path).json()) == 1  # removing an unrelated task changes nothing
    result = client.delete(f"{path}/{data['task']}")
    assert result.status_code == 204 and result.headers["cache-control"] == "no-store"
    assert client.get(path).json() == []
    assert client.delete(f"{path}/{data['task']}").status_code == 204
    with Session(db_engine) as db:
        remaining = list(db.scalars(select(TaskAssignment).where(TaskAssignment.task_id == data["task"])))
        assert [row.id for row in remaining] == [direct["id"]]
        assert db.scalar(select(SolutionDraft.source_code).where(SolutionDraft.student_id == data["second"])) == "saved"
        assert db.scalar(select(Submission.source_code).where(Submission.student_id == data["second"])) == "saved"
        db.get(Task, data["task"]).is_archived = False
        db.commit()
    login(client, data["second"])
    assert data["task"] not in [item["id"] for item in client.get("/student/tasks?view=assigned").json()["items"]]
    login(client, data["student"])
    assert client.get(f"/student/tasks/{data['task']}").status_code == 200


def test_group_removal_does_not_touch_assignments_from_another_group(client, data, db_engine):
    assert assign_group(client, data, "overlap").json()["assigned_count"] == 1
    assert assign_group(client, data).json()["assigned_count"] == 2
    assert client.delete(f"/teacher/groups/{data['group']}/task-assignments/{data['task']}").status_code == 204
    rows = client.get(f"/teacher/groups/{data['overlap']}/task-assignments").json()
    assert len(rows) == 1 and rows[0]["student_count"] == 1


def test_group_assignment_list_and_removal_enforce_ownership_and_origin(client, data):
    assert assign_group(client, data).status_code == 200
    foreign = f"/teacher/groups/{data['foreign_group']}/task-assignments"
    assert client.get(foreign).status_code == 404
    assert client.delete(f"{foreign}/{data['task']}").status_code == 404
    own = f"/teacher/groups/{data['group']}/task-assignments"
    assert client.delete(f"{own}/{data['task']}", headers={"Origin": "https://untrusted.example"}).status_code == 403
    assert len(client.get(own).json()) == 1


@pytest.mark.parametrize("actor,expected", [(None, 401), ("student", 403), ("admin", 403),
                                         ("pending", 403), ("inactive", 403)])
def test_group_assignment_management_rbac(client, data, actor, expected):
    login(client, data[actor] if actor else None)
    path = f"/teacher/groups/{data['group']}/task-assignments"
    assert client.get(path).status_code == expected
    assert client.delete(f"{path}/{data['task']}").status_code == expected


def test_active_task_count_counts_tasks_not_recipients_and_updates_on_removal(client, data, db_engine):
    path = f"/teacher/groups/{data['group']}"
    assert client.get(path).json()["active_task_count"] == 0

    assert assign_group(client, data).json()["assigned_count"] == 2
    assert client.get(path).json()["active_task_count"] == 1
    assert assign_group(client, data).json()["assigned_count"] == 0
    assert client.get(path).json()["active_task_count"] == 1
    assert client.post(f"/teacher/tasks/{data['second_task']}/group-assignments",
                       json={"group_id": data["group"]}).status_code == 200
    assert client.get(path).json()["active_task_count"] == 2
    with Session(db_engine) as db:
        db.get(Task, data["second_task"]).is_archived = True
        db.commit()
    assert client.get(path).json()["active_task_count"] == 1
    listed = next(row for row in client.get("/teacher/groups").json() if row["id"] == data["group"])
    assert listed["active_task_count"] == 1
    assert client.delete(f"{path}/task-assignments/{data['task']}").status_code == 204
    assert client.get(path).json()["active_task_count"] == 0


def test_teacher_assigned_task_filter_counts_tasks_not_students(client, data):
    assert client.get("/teacher/tasks?assigned=true&limit=1").json()["total"] == 0
    assert assign_group(client, data).json()["assigned_count"] == 2
    page = client.get("/teacher/tasks?assigned=true&limit=1").json()
    assert page["total"] == 1 and page["items"][0]["id"] == data["task"]
    assert data["task"] not in [row["id"] for row in client.get("/teacher/tasks?assigned=false").json()["items"]]
    login(client, data["other_teacher"])
    assert client.get("/teacher/tasks?assigned=true").json()["total"] == 0

    login(client, data["teacher"])
    assert client.delete(f"/teacher/groups/{data['group']}/task-assignments/{data['task']}").status_code == 204
    assert client.get("/teacher/tasks?assigned=true").json()["total"] == 0



def test_student_group_active_task_count_is_personal_and_excludes_archived_tasks(client, data, db_engine):
    # A direct source and a group source are independent, even for the same task.
    assert assign(client, data).status_code == 201
    assert assign_group(client, data).json()["assigned_count"] == 2
    assert client.post(f"/teacher/tasks/{data['second_task']}/group-assignments",
                       json={"group_id": data["group"]}).status_code == 200
    for actor, expected in [("student", 2), ("second", 2)]:
        login(client, data[actor])
        row = next(row for row in client.get("/student/groups").json() if row["id"] == data["group"])
        assert row["active_task_count"] == expected
        assert client.get(f"/student/groups/{data['group']}").json()["active_task_count"] == expected
    with Session(db_engine) as db:
        db.get(Task, data["second_task"]).is_archived = True
        db.commit()
    login(client, data["student"])
    assert client.get(f"/student/groups/{data['group']}").json()["active_task_count"] == 1
    login(client, data["second"])
    assert client.get(f"/student/groups/{data['group']}").json()["active_task_count"] == 1
    login(client, data["teacher"])
    assert client.delete(f"/teacher/groups/{data['group']}/task-assignments/{data['task']}").status_code == 204
    login(client, data["second"])
    assert client.get(f"/student/groups/{data['group']}").json()["active_task_count"] == 0


def test_two_groups_preserve_independent_sources_and_student_list_is_deduplicated(client, data):
    assert assign_group(client, data).json()["assigned_count"] == 2
    assert assign_group(client, data, "overlap").json()["assigned_count"] == 1
    assert assign_group(client, data, "overlap").json()["assigned_count"] == 0
    login(client, data["student"])
    page = client.get("/student/tasks?view=assigned").json()
    assert page["total"] == 1 and [row["id"] for row in page["items"]] == [data["task"]]
    assert page["progress_counts"]["NOT_STARTED"] == 1
    login(client, data["teacher"])
    assert client.delete(f"/teacher/groups/{data['group']}/task-assignments/{data['task']}").status_code == 204
    login(client, data["student"])
    assert client.get("/student/tasks?view=assigned").json()["total"] == 1
    login(client, data["teacher"])
    assert client.delete(f"/teacher/groups/{data['overlap']}/task-assignments/{data['task']}").status_code == 204
    login(client, data["student"])
    assert client.get("/student/tasks?view=assigned").json()["total"] == 0


def test_legacy_sources_from_two_teachers_remain_independently_revocable(client, data, db_engine):
    first = assign(client, data).json()
    # Existing sources created before the author-only policy must stay revocable.
    with Session(db_engine) as db:
        legacy = TaskAssignment(task_id=data["task"], student_id=data["student"],
                                assigned_by_teacher_id=data["other_teacher"])
        db.add(legacy); db.commit(); second_id = legacy.id
    login(client, data["other_teacher"])
    assert assign(client, data).status_code == 404
    url = f"/teacher/tasks/{data['task']}/assignments/{first['id']}"
    assert client.delete(url).status_code == 404
    login(client, data["teacher"])
    assert client.delete(f"/teacher/tasks/{data['other_task']}/assignments/{first['id']}").status_code == 404
    assert client.delete(url, headers={"Origin": "https://untrusted.example"}).status_code == 403
    assert client.delete(url).status_code == 204
    login(client, data["student"])
    assert client.get("/student/tasks?view=assigned").json()["total"] == 1
    login(client, data["other_teacher"])
    assert client.delete(f"/teacher/tasks/{data['task']}/assignments/{second_id}").status_code == 204
    login(client, data["student"])
    assert client.get("/student/tasks?view=assigned").json()["total"] == 0


def test_deleted_group_source_can_be_revoked_without_affecting_direct_source(client, data):
    direct = assign(client, data).json()
    assert assign_group(client, data).json()["assigned_count"] == 2
    assert client.delete(f"/teacher/groups/{data['group']}").status_code == 204
    # History and revoke remain available for archived tasks too.
    assert client.patch(f"/teacher/tasks/{data['task']}/archive").status_code == 200
    rows = client.get(f"/teacher/tasks/{data['task']}/assignments").json()
    orphan = next(row for row in rows if row["student_id"] == data["student"] and row["source_group_id"] == data["group"])
    assert orphan["group_id"] is None
    path = f"/teacher/tasks/{data['task']}/assignments/{orphan['id']}"
    login(client, data["other_teacher"])
    assert client.delete(path).status_code == 404
    login(client, data["teacher"])
    assert client.delete(path).status_code == 204
    remaining = client.get(f"/teacher/tasks/{data['task']}/assignments").json()
    assert any(row["id"] == direct["id"] for row in remaining)
    assert not any(row["id"] == orphan["id"] for row in remaining)


@pytest.mark.parametrize("actor,expected", [(None, 401), ("student", 403), ("admin", 403), ("pending", 403), ("inactive", 403)])
def test_revoke_assignment_rbac(client, data, actor, expected):
    row = assign(client, data).json()
    login(client, data[actor] if actor else None)
    assert client.delete(f"/teacher/tasks/{data['task']}/assignments/{row['id']}").status_code == expected


def test_concurrent_group_sources_are_deduplicated_per_source_not_per_student(client, data, db_engine):
    def send(group):
        with TestClient(app) as concurrent:
            login(concurrent, data["teacher"])
            response = assign_group(concurrent, data, group)
            assert response.status_code == 200
            return response.json()["assigned_count"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(send, ["group", "overlap"])) == [1, 2]
        assert list(pool.map(send, ["group", "group"])) == [0, 0]
    with Session(db_engine) as db:
        assert db.scalar(select(func.count()).select_from(TaskAssignment).where(
            TaskAssignment.task_id == data["task"], TaskAssignment.student_id == data["student"])) == 2


def test_non_author_can_revoke_legacy_archived_source_after_group_deletion(client, data, db_engine):
    # Seed a source permitted by the previous policy, without granting new access.
    with Session(db_engine) as db:
        db.add(TaskAssignment(task_id=data["task"], student_id=data["foreign"],
            assigned_by_teacher_id=data["other_teacher"], group_id=data["foreign_group"],
            source_group_id=data["foreign_group"]))
        db.commit()
    login(client, data["other_teacher"])
    assert client.delete(f"/teacher/groups/{data['foreign_group']}").status_code == 204
    login(client, data["teacher"])
    assert client.patch(f"/teacher/tasks/{data['task']}/archive").status_code == 200
    login(client, data["other_teacher"])
    response = client.get(f"/teacher/tasks/{data['task']}/assignments")
    assert response.status_code == 200
    row = response.json()[0]
    assert row["group_id"] is None and row["source_group_id"] == data["foreign_group"]
    assert client.delete(f"/teacher/tasks/{data['task']}/assignments/{row['id']}").status_code == 204


@pytest.mark.parametrize("kind", ["assignments", "group-assignments"])
@pytest.mark.parametrize("deadline", [None, "2020-01-01T12:00:00+02:00"])
def test_assignment_deadline_create(client, data, kind, deadline):
    payload = {"student_id": data["student"]} if kind == "assignments" else {"group_id": data["group"]}
    response = client.post(f"/teacher/tasks/{data['task']}/{kind}", json={**payload, "deadline": deadline})
    assert response.status_code in (200, 201)
    rows = client.get(f"/teacher/tasks/{data['task']}/assignments").json()
    assert all(bool(row["deadline"]) == bool(deadline) for row in rows)
    login(client, data["student"])
    task = client.get("/student/tasks").json()["items"][0]
    assert bool(task["deadline"]) == bool(deadline)
    assert task["is_overdue"] == bool(deadline)
    assert task["progress_status"] == "NOT_STARTED"


def test_deadline_edit_permissions_and_sources(client, data):
    direct = assign(client, data).json()
    assert direct["deadline"] is None
    assert assign_group(client, data).status_code == 200
    rows = client.get(f"/teacher/tasks/{data['task']}/assignments").json()
    grouped = next(row for row in rows if row["student_id"] == data["student"] and row["source_group_id"])
    def patch(row, deadline):
        return client.patch(f"/teacher/tasks/{data['task']}/assignments/{row['id']}", json={"deadline": deadline})
    for deadline in ("2030-01-01T12:00:00Z", "2020-01-01T12:00:00Z", None):
        changed = patch(direct, deadline)
        assert changed.status_code == 200
        assert changed.json()["id"] == direct["id"]
        assert changed.json()["source_group_id"] is None
        assert bool(changed.json()["deadline"]) == bool(deadline)
    patch(direct, "2030-01-01T12:00:00Z")
    patch(grouped, "2020-01-01T12:00:00Z")
    login(client, data["other_teacher"])
    assert patch(direct, None).status_code == 404
    login(client, data["student"])
    assert patch(direct, None).status_code == 403
    page = client.get("/student/tasks?overdue=true").json()
    assert page["total"] == 1 and page["items"][0]["deadline"].startswith("2020")
    login(client, data["outsider"])
    assert client.get("/student/tasks").json()["total"] == 0
    assert all(row["deadline"] is None for row in client.get("/student/tasks?view=catalog").json()["items"])
    login(client, data["teacher"])
    assert client.delete(f"/teacher/groups/{data['group']}").status_code == 204
    assert patch(grouped, "2021-01-01T12:00:00Z").status_code == 200
    assert client.delete(f"/teacher/tasks/{data['task']}/assignments/{grouped['id']}").status_code == 204
    assert len(client.get(f"/teacher/tasks/{data['task']}/assignments").json()) == 2
    login(client, data["student"])
    assert client.get("/student/tasks").json()["items"][0]["deadline"].startswith("2030")
    assert client.get("/student/tasks?overdue=true").json()["total"] == 0


def test_deadline_requires_timezone_and_explicit_patch(client, data):
    row = assign(client, data).json()
    path = f"/teacher/tasks/{data['task']}/assignments/{row['id']}"
    for payload in ({}, {"deadline": "2030-01-01T12:00"}, {"deadline": None, "teacher_id": data["teacher"]}):
        assert client.patch(path, json=payload).status_code == 422


def test_bulk_group_deadline_preserves_other_sources(client, data, db_engine):
    direct = assign(client, data).json()
    assign_group(client, data)
    assign_group(client, data, "overlap")
    path = f"/teacher/groups/{data['group']}/task-assignments/{data['task']}"
    with Session(db_engine) as db:
        from app.models.group import group_students
        db.execute(group_students.delete().where(group_students.c.group_id == data["group"],
            group_students.c.student_id == data["student"]))
        db.commit()
    original_ids = {row["id"] for row in client.get(f"/teacher/tasks/{data['task']}/assignments").json()}
    for deadline in ("2030-01-01T12:00:00Z", "2031-01-01T12:00:00Z", None):
        assert client.patch(path, json={"deadline": deadline}).status_code == 204
        rows = client.get(f"/teacher/tasks/{data['task']}/assignments").json()
        assert {row["id"] for row in rows} == original_ids
        assert all(bool(row["deadline"]) == bool(deadline) for row in rows if row["source_group_id"] == data["group"])
        assert all(row["deadline"] is None for row in rows if row["source_group_id"] != data["group"])
        group_row = client.get(f"/teacher/groups/{data['group']}/task-assignments").json()[0]
        assert bool(group_row["deadline"]) == bool(deadline)
        assert group_row["deadlines_differ"] is False
    assert client.patch(f"/teacher/tasks/{data['task']}/assignments/{next(row['id'] for row in rows if row['source_group_id'] == data['group'])}",
        json={"deadline": "2030-01-01T12:00:00Z"}).status_code == 200
    assert client.get(f"/teacher/groups/{data['group']}/task-assignments").json()[0]["deadlines_differ"] is True
    login(client, data["other_teacher"])
    assert client.patch(path, json={"deadline": None}).status_code == 404
    login(client, data["student"])
    assert client.patch(path, json={"deadline": None}).status_code == 403
    login(client, data["teacher"])
    assert client.patch(path, json={}).status_code == 422
    assert client.patch(path, json={"deadline": None}, headers={"Origin": "https://untrusted.invalid"}).status_code == 403
    assert client.patch(path.replace(str(data["task"]), "2147483647"), json={"deadline": None}).status_code == 404
