"""Publication, public practice and one reviewer across independent assignment grants."""
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.api.student import get_judge0_service
from app.core.config import get_settings
from app.core.security import create_access_token
from app.main import app
from app.models.group import StudentGroup
from app.models.task import Task, TaskStatus
from app.models.task_assignment import TaskAssignment
from app.models.solution import SolutionDraft, Submission
from app.models.publication import PublicationReview
from app.models.review import SubmissionReview
from app.models.user import User, UserRole, TeacherApproval, AccountStatus
from app.services.submission_access import claim_submission


@pytest.fixture(scope="module")
def people(client, db_engine):
    with Session(db_engine) as db:
        ids = {}
        for name in ("author", "a", "b", "student", "admin", "pending", "inactive"):
            role = UserRole.STUDENT if name == "student" else UserRole.ADMIN if name == "admin" else UserRole.TEACHER
            user = User(login="publication_" + name, email=name + "@publication.test", role=role, password_hash="unused",
                status=AccountStatus.INACTIVE if name == "inactive" else AccountStatus.ACTIVE,
                teacher_approval=(TeacherApproval.PENDING if name == "pending" else TeacherApproval.APPROVED) if role == UserRole.TEACHER else None)
            db.add(user); db.flush(); ids[name] = user.id
        for name in ("author", "a", "b"):
            group = StudentGroup(name="publication_" + name, teacher_id=ids[name], students=[db.get(User, ids["student"])])
            db.add(group); db.flush(); ids[name + "_group"] = group.id
        db.commit()
        return ids


def login(client, people, name):
    client.cookies.clear()
    client.cookies.set(get_settings().cookie_name, create_access_token(people[name]))


def new_task(client, people, status="READY"):
    login(client, people, "author")
    response = client.post("/teacher/tasks", json=dict(title="Publication", topic="Python", difficulty="EASY",
        task_type="STANDARD", status=status, instructions="Print a number", starter_code="print(1)"))
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_own_in_review_filter_only_includes_active_pending_publication_tasks(client, people, db_engine):
    with Session(db_engine) as db:
        expected = []
        created = []
        for status in TaskStatus:
            for owner in ("author", "a"):
                task = Task(title="Review filter", topic="Python", difficulty="EASY", task_type="STANDARD",
                    status=status, instructions="Print", author_id=people[owner])
                db.add(task); db.flush(); created.append(task.id)
                if owner == "author" and status in (TaskStatus.PENDING_TEACHER_REVIEW, TaskStatus.PENDING_ADMIN_REVIEW):
                    expected.append(task.id)
        archived = Task(title="Archived review", topic="Python", difficulty="EASY", task_type="STANDARD",
            status=TaskStatus.PENDING_TEACHER_REVIEW, is_archived=True, author_id=people["author"])
        db.add(archived); db.flush(); created.append(archived.id)
        db.commit()
    login(client, people, "author")
    result = client.get("/teacher/tasks?view=own&in_review=true&limit=100")
    assert result.status_code == 200
    assert {task["id"] for task in result.json()["items"] if task["id"] in created} == set(expected)


def test_all_teacher_tasks_include_own_and_public_once_with_ownership_filter(client, people, db_engine):
    own_ids = set()
    public_ids = set()
    with Session(db_engine) as db:
        for owner in ("author", "a"):
            for status in TaskStatus:
                task = Task(title="Combined catalogue", topic="Combined", difficulty="EASY", task_type="STANDARD",
                    status=status, instructions="Print", author_id=people[owner])
                db.add(task); db.flush()
                if owner == "author": own_ids.add(task.id)
                if status == TaskStatus.PUBLISHED: public_ids.add(task.id)
        archived = Task(title="Combined catalogue archived", topic="Combined", difficulty="EASY", task_type="STANDARD",
            status=TaskStatus.PUBLISHED, is_archived=True, author_id=people["a"])
        db.add(archived); db.commit()
    login(client, people, "author")
    path = "/teacher/tasks?view=all&q=Combined%20catalogue&limit=100"
    all_tasks = client.get(path).json()
    expected = own_ids | public_ids
    assert {task["id"] for task in all_tasks["items"]} == expected
    assert all_tasks["total"] == len(expected) == len(all_tasks["items"])
    mine = client.get(path + "&own_only=true").json()
    assert {task["id"] for task in mine["items"]} == own_ids
    assert mine["total"] == len(own_ids)
    assert client.get(path.replace("limit=100", "limit=2")).json()["total"] == len(expected)
    own_public = client.get(path.replace("view=all", "view=catalog") + "&own_only=true").json()
    assert {task["id"] for task in own_public["items"]} == own_ids & public_ids


def test_task_tab_counts_respect_search_and_access_but_not_active_tab_or_page(client, people, db_engine):
    with Session(db_engine) as db:
        tasks = {}
        for name, owner, status, archived in [
            ("draft", "author", TaskStatus.DRAFT, False),
            ("ready", "author", TaskStatus.READY, False),
            ("public", "author", TaskStatus.PUBLISHED, False),
            ("teacher", "author", TaskStatus.PENDING_TEACHER_REVIEW, False),
            ("admin", "author", TaskStatus.PENDING_ADMIN_REVIEW, False),
            ("archived", "author", TaskStatus.DRAFT, True),
            ("foreign_public", "a", TaskStatus.PUBLISHED, False),
            ("foreign_ready", "a", TaskStatus.READY, False),
            ("foreign_archive", "a", TaskStatus.PUBLISHED, True),
        ]:
            task = Task(title="Counted tasks " + name, topic="Counts", difficulty="EASY", task_type="STANDARD",
                instructions="Print", status=status, is_archived=archived, author_id=people[owner])
            db.add(task); db.flush(); tasks[name] = task.id
        for name, group in [("ready", None), ("ready", 98765), ("foreign_public", None)]:
            db.add(TaskAssignment(task_id=tasks[name], student_id=people["student"],
                assigned_by_teacher_id=people["author"], source_group_id=group))
        db.commit()
    login(client, people, "author")
    path = "/teacher/tasks?view=all&q=Counted%20tasks&limit=1"
    expected = dict(ALL=7, OWN=6, ASSIGNED=2, DRAFT=1, PUBLIC=2, IN_REVIEW=2, ARCHIVED=1)
    assert client.get(path).json()["tab_counts"] == expected
    assert client.get(path + "&offset=1").json()["tab_counts"] == expected
    filtered = client.get(path + "&own_only=true&status=DRAFT&archived=false").json()
    assert filtered["total"] == 1 and filtered["tab_counts"] == expected
    assert set(client.get(path.replace("Counted%20tasks", "no-matching-count-title")).json()["tab_counts"].values()) == {0}
    login(client, people, "b")
    assert client.get(path).json()["tab_counts"] == dict(ALL=2, OWN=0, ASSIGNED=0, DRAFT=0, PUBLIC=2, IN_REVIEW=0, ARCHIVED=0)


def test_review_counts_use_latest_work_and_respect_scope_search_and_privacy(client, people, db_engine):
    task_id = new_task(client, people)
    with Session(db_engine) as db:
        task = db.get(Task, task_id); task.title = "Counted student reviews"
        students = []
        for name in ("counts_first", "counts_second", "counts_third"):
            user = User(login=name, role=UserRole.STUDENT, password_hash="unused")
            db.add(user); db.flush(); students.append(user.id)
        for index, student_id in enumerate(students):
            db.add(TaskAssignment(task_id=task_id, student_id=student_id, assigned_by_teacher_id=people["author"]))
            for version in ([1, 2] if index == 0 else [1]):
                row = Submission(task_id=task_id, student_id=student_id, version=version, source_code="print(1)",
                    reviewer_teacher_id=None if index == 0 and version == 2 else people["author"],
                    summary=dict(passed_tests=0, failed_tests=0, total_tests=0, all_passed=True))
                db.add(row); db.flush()
                if not (index == 0 and version == 2):
                    db.add(SubmissionReview(submission_id=row.id, decision="CHANGES_REQUESTED" if index == 2 else "ACCEPTED",
                        feedback="Improve" if index == 2 else "", reviewed_by=people["author"]))
        db.commit()
    expected = dict(ALL=3, PENDING=1, ACCEPTED=1, CHANGES_REQUESTED=1)
    path = f"/teacher/submissions?task_id={task_id}&limit=1"
    assert client.get(path).json()["review_counts"] == expected
    assert client.get(path + "&review_status=ACCEPTED&offset=1").json()["review_counts"] == expected
    assert client.get(path + "&scope=mine").json()["review_counts"] == dict(ALL=2, PENDING=0, ACCEPTED=1, CHANGES_REQUESTED=1)
    assert client.get(path + "&scope=available").json()["review_counts"] == dict(ALL=1, PENDING=1, ACCEPTED=0, CHANGES_REQUESTED=0)
    assert set(client.get(path + "&q=not-a-matching-review").json()["review_counts"].values()) == {0}
    login(client, people, "b")
    assert set(client.get("/teacher/submissions?q=Counted%20student%20reviews").json()["review_counts"].values()) == {0}


def decide(client, task_id, stage="teacher", decision="ACCEPTED", round=1):
    return client.post(f"/{stage}/publication-reviews/{task_id}", json=dict(publication_round=round,
        decision=decision, comment="Improve the instructions" if decision == "CHANGES_REQUESTED" else "Looks good"))


def publish(client, people):
    task_id = new_task(client, people)
    assert client.post(f"/teacher/tasks/{task_id}/publication").status_code == 200
    login(client, people, "a"); assert decide(client, task_id).status_code == 200
    login(client, people, "admin"); assert decide(client, task_id, "admin").json()["status"] == "PUBLISHED"
    return task_id


def submit(client, people, task_id):
    login(client, people, "student")
    draft = client.get(f"/student/tasks/{task_id}/draft")
    assert draft.status_code == 200, draft.text
    response = client.post(f"/student/tasks/{task_id}/submissions", json={"revision": draft.json()["revision"]})
    assert response.status_code == 201, response.text
    return response.json()["submission"]["id"]


def test_publication_rounds_history_and_read_only(client, people, db_engine):
    task_id = new_task(client, people)
    base = f"/teacher/tasks/{task_id}"
    assert client.post(base + "/publication").json()["status"] == "PENDING_TEACHER_REVIEW"
    assert client.post(base + "/publication").status_code == 409
    assert client.patch(base, json={"instructions": "Changed"}).status_code == 409
    assert client.post(base + "/hints", json={"title": "Hint", "content": "content"}).status_code == 409
    assert client.post(base + "/tests", json={"name": "Test", "test_type": "INPUT_OUTPUT", "config": {"input_data": "", "expected_output": "1"}}).status_code == 409
    assert decide(client, task_id).status_code == 403
    assert task_id not in [t["id"] for t in client.get("/teacher/publication-reviews").json()["items"]]
    login(client, people, "a")
    assert task_id in [t["id"] for t in client.get("/teacher/publication-reviews").json()["items"]]
    assert decide(client, task_id, decision="CHANGES_REQUESTED").json()["status"] == "CHANGES_REQUESTED_BY_TEACHER"
    login(client, people, "author")
    assert client.patch(base, json={"instructions": "Better"}).status_code == 200
    assert client.post(base + "/publication").json()["publication_round"] == 2
    login(client, people, "a")
    assert decide(client, task_id, round=1).status_code == 409
    assert decide(client, task_id, round=2).json()["status"] == "PENDING_ADMIN_REVIEW"
    login(client, people, "admin")
    detail = client.get(f"/publication/tasks/{task_id}").json()
    assert len(detail["history"]) == 2 and detail["history"][-1]["reviewer_id"] == people["a"]
    assert decide(client, task_id, "admin", "CHANGES_REQUESTED", 2).json()["status"] == "CHANGES_REQUESTED_BY_ADMIN"
    login(client, people, "author")
    assert client.post(base + "/publication").json()["status"] == "PENDING_TEACHER_REVIEW"
    login(client, people, "admin"); assert decide(client, task_id, "admin", round=3).status_code == 409
    login(client, people, "b"); assert decide(client, task_id, round=3).status_code == 200
    login(client, people, "admin"); assert decide(client, task_id, "admin", round=3).json()["status"] == "PUBLISHED"
    login(client, people, "author")
    assert client.patch(base, json={"title": "Unreviewed"}).status_code == 409
    assert len(client.get(f"/publication/tasks/{task_id}").json()["history"]) == 5
    assert client.post(base + "/withdraw-publication").json()["status"] == "READY"
    assert client.patch(base, json={"title": "Edited"}).status_code == 200
    with Session(db_engine) as db:
        assert db.scalar(select(func.count()).select_from(PublicationReview).where(PublicationReview.task_id == task_id)) == 5


def test_publication_validation_and_catalog_visibility(client, people, db_engine):
    draft = new_task(client, people, "DRAFT")
    assert client.post(f"/teacher/tasks/{draft}/publication").status_code == 409
    ready = new_task(client, people)
    login(client, people, "b"); assert client.post(f"/teacher/tasks/{ready}/publication").status_code == 404
    login(client, people, "author"); assert client.patch(f"/teacher/tasks/{ready}/archive").status_code == 200
    assert client.post(f"/teacher/tasks/{ready}/publication").status_code == 409
    public = publish(client, people)
    for name in ("pending", "inactive", "student"):
        login(client, people, name)
        assert client.get("/teacher/publication-reviews").status_code == 403
        assert client.post(f"/teacher/publication-reviews/{public}", json={"publication_round": 1, "decision": "ACCEPTED"}).status_code == 403
    login(client, people, "student")
    ids = [t["id"] for t in client.get("/student/tasks?view=catalog").json()["items"]]
    assert public in ids and ready not in ids and draft not in ids
    assert client.get(f"/student/tasks/{ready}").status_code == 404
    login(client, people, "author"); assert client.patch(f"/teacher/tasks/{public}/archive").status_code == 200
    login(client, people, "student")
    assert public not in [t["id"] for t in client.get("/student/tasks?view=catalog").json()["items"]]
    assert client.get(f"/student/tasks/{public}").status_code == 404
    with Session(db_engine) as db:
        assert db.get(Task, ready).status == TaskStatus.READY


def test_public_practice_global_claim_privacy_and_continuity(client, people, db_engine):
    task_id = publish(client, people)
    runner = SimpleNamespace(execution_deadline=lambda cpu: 10, run_code=AsyncMock(return_value={"status": "completed", "stdout": "1"}))
    app.dependency_overrides[get_judge0_service] = lambda: runner
    try:
        login(client, people, "student")
        assert client.post(f"/student/tasks/{task_id}/run", json={"source_code": "print(1)"}).status_code == 200
        assert client.put(f"/student/tasks/{task_id}/draft", json={"source_code": "print(1)"}).status_code == 200
        submission = submit(client, people, task_id)
        for name in ("author", "a", "b"):
            login(client, people, name)
            assert submission in [t["latest_submission"]["id"] for t in client.get("/teacher/submissions?scope=available").json()["items"]]
        assert client.put(f"/teacher/submissions/{submission}/review", json={"decision": "ACCEPTED"}).status_code == 409
        login(client, people, "a")
        assert client.post(f"/teacher/submissions/{submission}/claim").status_code == 200
        assert client.put(f"/teacher/submissions/{submission}/review", json={"decision": "CHANGES_REQUESTED", "feedback": "Improve"}).status_code == 200
        for name in ("author", "b"):
            login(client, people, name)
            assert submission not in [t["latest_submission"]["id"] for t in client.get("/teacher/submissions?scope=available").json()["items"]]
            assert client.get(f"/teacher/submissions/{submission}").status_code == 404
            assert client.post(f"/teacher/submissions/{submission}/claim").status_code == 409
            assert client.get(f"/teacher/students/{people['student']}/note").status_code == 404
        following = submit(client, people, task_id)
        login(client, people, "a")
        assert client.get(f"/teacher/submissions/{following}").json()["reviewer_teacher_id"] == people["a"]
        assert client.put(f"/teacher/submissions/{following}/review", json={"decision": "ACCEPTED", "feedback": "Good"}).status_code == 200
        login(client, people, "student")
        assert client.get(f"/student/tasks/{task_id}/draft").json()["latest_submission"]["review"]["feedback"] == "Good"
        other_task = publish(client, people)
        independent = submit(client, people, other_task)
        with Session(db_engine) as db:
            assert db.get(Submission, independent).reviewer_teacher_id is None
    finally:
        app.dependency_overrides.pop(get_judge0_service, None)


def test_multiple_teachers_sources_claim_and_revocation(client, people, db_engine):
    task_id = publish(client, people)
    assignment_ids = {}
    for name in ("a", "b"):
        login(client, people, name)
        assignment_ids[name] = client.post(f"/teacher/tasks/{task_id}/assignments", json={"student_id": people["student"]}).json()["id"]
        assert client.post(f"/teacher/tasks/{task_id}/group-assignments", json={"group_id": people[name + "_group"]}).status_code == 200
    login(client, people, "a")
    assert client.delete(f"/teacher/tasks/{task_id}/assignments/{assignment_ids['a']}").status_code == 204
    submission = submit(client, people, task_id)
    for name in ("a", "b"):
        login(client, people, name)
        assert client.get(f"/teacher/submissions/{submission}").status_code == 200
    login(client, people, "author")
    assert client.get(f"/teacher/submissions/{submission}").status_code == 404
    login(client, people, "a")
    assert client.delete(f"/teacher/groups/{people['a_group']}/task-assignments/{task_id}").status_code == 204
    assert client.get(f"/teacher/submissions/{submission}").status_code == 404
    login(client, people, "b")
    assert client.post(f"/teacher/submissions/{submission}/claim").status_code == 200
    assert client.put(f"/teacher/submissions/{submission}/review", json={"decision": "ACCEPTED"}).status_code == 200
    with Session(db_engine) as db:
        assert not db.get(Submission, submission).is_catalog_submission
        assert db.scalar(select(func.count()).select_from(Submission).where(Submission.task_id == task_id)) == 1


def test_own_ready_assignment_and_foreign_ready_denied(client, people):
    task_id = new_task(client, people)
    assert client.post(f"/teacher/tasks/{task_id}/assignments", json={"student_id": people["student"]}).status_code == 201
    assert client.post(f"/teacher/tasks/{task_id}/group-assignments", json={"group_id": people["author_group"]}).status_code == 200
    login(client, people, "a")
    assert client.post(f"/teacher/tasks/{task_id}/assignments", json={"student_id": people["student"]}).status_code == 404
    assert task_id not in [t["id"] for t in client.get("/teacher/tasks?view=assignable").json()["items"]]
    submission = submit(client, people, task_id)
    login(client, people, "author")
    assert client.post(f"/teacher/submissions/{submission}/claim").status_code == 200


@pytest.mark.parametrize("assigned", [False, True])
def test_concurrent_claim_has_one_winner(client, people, db_engine, assigned):
    task_id = publish(client, people)
    if assigned:
        for name in ("a", "b"):
            login(client, people, name)
            assert client.post(f"/teacher/tasks/{task_id}/assignments", json={"student_id": people["student"]}).status_code == 201
    submission = submit(client, people, task_id)
    from threading import Barrier
    start = Barrier(2)
    def claim(teacher_id):
        with Session(db_engine) as db:
            start.wait(timeout=10)
            try:
                claim_submission(db, submission, teacher_id)
                return 200
            except HTTPException as exc:
                db.rollback(); return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(claim, [people["a"], people["b"]])) == [200, 409]
    with Session(db_engine) as db:
        row = db.get(Submission, submission)
        draft = db.scalar(select(SolutionDraft).where(SolutionDraft.task_id == task_id, SolutionDraft.student_id == people["student"]))
        assert row.reviewer_teacher_id == draft.reviewer_teacher_id


def test_concurrent_publication_decisions_are_not_overwritten(client, people, db_engine):
    from app.api.publication import decide as decide_service, Decision
    task_id = new_task(client, people)
    assert client.post(f"/teacher/tasks/{task_id}/publication").status_code == 200
    def review(args):
        name, decision = args
        with Session(db_engine) as db:
            try:
                decide_service(db, task_id, Decision(publication_round=1, decision=decision, comment="Review"), db.get(User, people[name]), "TEACHER")
                return 200
            except HTTPException as exc:
                db.rollback(); return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(review, [("a", "ACCEPTED"), ("b", "CHANGES_REQUESTED")])) == [200, 409]
    with Session(db_engine) as db:
        assert db.scalar(select(func.count()).select_from(PublicationReview).where(PublicationReview.task_id == task_id)) == 1
