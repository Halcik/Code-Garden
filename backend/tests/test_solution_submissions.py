from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select, func, update
from sqlalchemy.exc import IntegrityError, DBAPIError
from sqlalchemy.orm import Session

from app.api.student import get_judge0_service
from app.main import app
from app.models.solution import SolutionDraft, DraftUsedHint, Submission, SubmissionUsedHint, SolutionTestResult
from app.models.task import Task, TaskTest, TaskHint
from app.models.user import User, UserRole
from app.services.judge0 import Judge0Error
from app.services import solutions
from test_execution_integration import actors, create, login


@pytest.fixture
def work(client, actors):
    login(client, actors, "TEACHER")
    task = create(client)
    base = f"/teacher/tasks/{task['id']}"
    client.patch(base, json={"starter_code": "print('starter')"})
    for hidden in (False, True):
        assert client.post(base + "/tests", json={"name": "SECRET" if hidden else "Example",
            "test_type": "INPUT_OUTPUT", "config": {"input_data": "SECRET" if hidden else "hello", "expected_output": "ok"},
            "is_hidden": hidden}).status_code == 201
    for n in range(1, 4):
        assert client.post(base + "/hints", json={"title": f"Hint {n}", "content": f"Content {n}"}).status_code == 201
    login(client, actors, "STUDENT")
    runner = SimpleNamespace(execution_deadline=lambda cpu: 10,
                             run_code=AsyncMock(return_value={"status": "completed", "stdout": "ok"}))
    app.dependency_overrides[get_judge0_service] = lambda: runner
    yield f"/student/tasks/{task['id']}", task['id'], runner
    app.dependency_overrides.pop(get_judge0_service, None)


def save(client, path, source="print('A')", revision=None):
    payload = {"source_code": source}
    if revision is not None:
        payload["revision"] = revision
    response = client.put(path + "/draft", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def submit(client, path):
    draft = client.get(path + "/draft").json()
    return client.post(path + "/submissions", json={"revision": draft['revision']})


def test_draft_initialization_updates_and_starter_changes(client, work, actors, db_engine):
    path, task_id, _ = work
    first = client.get(path + "/draft").json()
    assert first['source_code'] == "print('starter')"
    assert first['last_check'] is None and first['latest_submission'] is None
    a = save(client, path)
    b = save(client, path, "", a['revision'])
    assert first['id'] == a['id'] == b['id'] and b['revision'] == 2
    assert client.put(path + "/draft", json={"source_code": "old", "revision": 0}).status_code == 409
    with Session(db_engine) as db:
        db.execute(update(Task).where(Task.id == task_id).values(starter_code="new starter")); db.commit()
    restored = client.get(path + "/draft").json()
    assert restored['source_code'] == "" and restored['revision'] == 2
    with Session(db_engine) as db:
        db.add(SolutionDraft(student_id=actors['STUDENT'], task_id=task_id, source_code="duplicate"))
        with pytest.raises(IntegrityError): db.commit()


def test_hint_reveal_is_explicit_idempotent_and_ordered(client, work, db_engine):
    path, _, _ = work
    assert client.get(path + "/hints").json()['revealed'] == []
    assert client.get(path + "/hints/1").status_code == 404
    assert client.get(path + "/draft").json()['used_hints'] == []
    for n in (2, 1, 2):
        assert client.post(path + f"/hints/{n}/reveal").status_code == 200
    hints = client.get(path + "/draft").json()['used_hints']
    assert len(hints) == 2 and all(h['revealed_at'] for h in hints)
    assert [h['number'] for h in client.get(path + "/hints").json()['revealed']] == [1, 2]
    assert len(client.get(path + "/revealed-hints").json()) == 2
    with Session(db_engine) as db:
        ids = [h.hint_id for h in db.scalars(select(DraftUsedHint).where(DraftUsedHint.draft_id == client.get(path + '/draft').json()['id']).order_by(DraftUsedHint.id))]
        assert ids == [h['hint_id'] for h in hints]
    assert client.post(path + "/hints/0/reveal").status_code == 404


def test_all_hint_reads_require_recorded_reveal_and_submission_snapshots_it(client, work, db_engine):
    path, task_id, _ = work
    for number in range(1, 4):
        response = client.get(path + f'/hints/{number}')
        assert response.status_code == 404
        assert response.json() == {'detail': 'Hint not found'}
        assert response.headers['cache-control'] == 'no-store'
    with Session(db_engine) as db:
        assert db.scalar(select(func.count()).select_from(SolutionDraft).where(SolutionDraft.task_id == task_id)) == 0
    assert client.get(path + '/hints').json()['revealed'] == []
    assert client.get(path + '/revealed-hints').json() == []
    assert 'Content' not in client.get(path).text
    assert 'Content' not in client.get(path + '/draft').text

    reveal = client.post(path + '/hints/2/reveal')
    assert reveal.status_code == 200
    before = client.get(path + '/draft').json()['used_hints']
    assert len(before) == 1
    for _ in range(2):
        assert client.get(path + '/hints/2').json() == reveal.json()
        assert client.get(path + '/hints').json()['revealed'] == [reveal.json()]
        assert client.get(path + '/revealed-hints').json() == [reveal.json()]
        for number in (1, 3):
            assert client.get(path + f'/hints/{number}').status_code == 404
    assert client.get(path + '/draft').json()['used_hints'] == before
    response = submit(client, path)
    assert response.status_code == 201
    with Session(db_engine) as db:
        hints = list(db.scalars(select(SubmissionUsedHint).where(
            SubmissionUsedHint.submission_id == response.json()['submission']['id'])))
        assert len(hints) == 1
        assert hints[0].hint_id == before[0]['hint_id'] and hints[0].reveal_order == 1
        assert hints[0].revealed_at.isoformat() == before[0]['revealed_at']


def test_another_students_reveal_does_not_unlock_hint_reads(client, work, actors, db_engine):
    from app.core.config import get_settings
    from app.core.security import create_access_token
    path, task_id, _ = work
    assert client.post(path + '/hints/1/reveal').status_code == 200
    with Session(db_engine) as db:
        user = User(login=f'hint_reader_{task_id}', email=f'hint_reader_{task_id}@example.com',
                    role=UserRole.STUDENT, password_hash='unused')
        db.add(user); db.commit(); user_id = user.id
    client.cookies.clear()
    client.cookies.set(get_settings().cookie_name, create_access_token(user_id))
    assert client.get(path + '/hints/1').status_code == 404
    assert client.get(path + '/hints').json()['revealed'] == []
    assert client.get(path + '/revealed-hints').json() == []
    login(client, actors, 'STUDENT')
    assert client.get(path + '/hints/1').status_code == 200


def test_reorder_does_not_unlock_unrevealed_hint_by_old_number(client, work, db_engine):
    path, task_id, _ = work
    revealed = client.post(path + '/hints/1/reveal').json()
    with Session(db_engine) as db:
        hints = list(db.scalars(select(TaskHint).where(TaskHint.task_id == task_id).order_by(TaskHint.position)))
        hints[0].position, hints[1].position = hints[1].position, hints[0].position
        db.commit()
    assert client.get(path + '/hints/1').status_code == 404
    assert client.get(path + '/hints/2').json() == {**revealed, 'number': 2}


def test_check_persists_code_hash_results_and_staleness(client, work):
    path, _, runner = work
    result = client.post(path + "/check", json={"source_code": "code A"})
    assert result.status_code == 200 and 'SECRET' not in result.text
    draft = client.get(path + "/draft").json()
    assert draft['source_code'] == 'code A' and draft['check_is_current']
    assert draft['last_check'] == result.json() and draft['checked_at'] and draft['check_count'] == 1
    changed = save(client, path, 'code B')
    assert not changed['check_is_current'] and changed['last_check'] == result.json()
    assert save(client, path, 'code A')['check_is_current']
    assert runner.run_code.await_count == 2


def test_submission_retests_and_preserves_immutable_snapshot(client, work, db_engine):
    path, task_id, runner = work
    save(client, path, 'code A')
    client.post(path + '/hints/1/reveal')
    assert client.post(path + '/check', json={"source_code": 'code A'}).json()['passed'] == 2
    runner.run_code.return_value = {"status": "completed", "stdout": "wrong"}
    response = submit(client, path)
    assert response.status_code == 201 and 'SECRET' not in response.text
    first = response.json()
    assert first['submission']['version'] == 1 and first['submission']['passed_tests'] == 0
    assert first['submission']['failed_tests'] == 2 and not first['submission']['all_passed']
    assert runner.run_code.await_count == 4
    assert first['draft']['source_code'] == 'code A' and first['draft']['check_is_current']
    assert len(first['draft']['used_hints']) == 1 and first['draft']['last_check']['passed'] == 0
    save(client, path, 'code B')
    client.post(path + '/hints/2/reveal')
    assert not client.get(path + '/draft').json()['check_is_current']
    with Session(db_engine) as db:
        tests = list(db.scalars(select(TaskTest).where(TaskTest.task_id == task_id)))
        for test in tests: test.config = {"input_data": "changed", "expected_output": "wrong"}
        db.commit()
    second = submit(client, path).json()
    assert second['submission']['version'] == 2 and second['submission']['passed_tests'] == 2
    with Session(db_engine) as db:
        old = db.get(Submission, first['submission']['id'])
        assert old.source_code == 'code A' and old.summary['passed_tests'] == 0
        rows = list(db.scalars(select(SolutionTestResult).where(SolutionTestResult.submission_id == old.id)))
        assert len(rows) == 2 and all(r.definition['config']['expected_output'] == 'ok' for r in rows)
        old_hints = list(db.scalars(select(SubmissionUsedHint).where(SubmissionUsedHint.submission_id == old.id)))
        assert len(old_hints) == 1 and old_hints[0].reveal_order == 1 and old_hints[0].revealed_at
        newer_hints = list(db.scalars(select(SubmissionUsedHint).where(SubmissionUsedHint.submission_id == second['submission']['id'])))
        assert len(newer_hints) == 2
        # Deleting live tests/hints does not destroy historical identities/definitions.
        for test in db.scalars(select(TaskTest).where(TaskTest.task_id == task_id)): db.delete(test)
        for hint in db.scalars(select(TaskHint).where(TaskHint.task_id == task_id)): db.delete(hint)
        db.commit()
        assert len(list(db.scalars(select(SubmissionUsedHint).where(SubmissionUsedHint.submission_id == old.id)))) == 1
        with pytest.raises(DBAPIError):
            db.execute(update(Submission).where(Submission.id == old.id).values(source_code='tampered')); db.commit()


@pytest.mark.parametrize('status', ['execution_error', 'time_limit_exceeded'])
def test_student_execution_failure_is_valid_submission(client, work, status):
    path, _, runner = work
    runner.run_code.return_value = {"status": status, "stderr": "student error"}
    data = submit(client, path)
    assert data.status_code == 201 and data.json()['submission']['failed_tests'] == 2


@pytest.mark.parametrize('code', [502, 503, 504])
def test_infrastructure_failure_creates_no_partial_history(client, work, db_engine, code):
    path, task_id, runner = work
    before = client.get(path + '/draft').json()
    runner.run_code.side_effect = [{"status": "completed", "stdout": "ok"}, Judge0Error(code, 'Technical failure')]
    assert submit(client, path).status_code == code
    assert client.get(path + '/draft').json() == before
    with Session(db_engine) as db:
        assert db.scalar(select(func.count()).select_from(Submission).where(Submission.task_id == task_id)) == 0


def test_failed_persistence_rolls_back_all_snapshot_rows(client, work, monkeypatch, db_engine):
    path, task_id, _ = work
    before = client.get(path + '/draft').json()
    def fail(*args, **kwargs): raise RuntimeError('simulated write failure')
    monkeypatch.setattr(solutions, 'store_check', fail)
    with pytest.raises(RuntimeError, match='simulated'):
        submit(client, path)
    assert client.get(path + '/draft').json() == before
    with Session(db_engine) as db:
        assert db.scalar(select(func.count()).select_from(Submission).where(Submission.task_id == task_id)) == 0
        assert not list(db.scalars(select(SolutionTestResult).join(Submission).where(Submission.task_id == task_id)))


@pytest.mark.parametrize('role,status', [(None, 401), ('TEACHER', 403), ('ADMIN', 403)])
@pytest.mark.parametrize('operation', ['get', 'put', 'submit', 'reveal'])
def test_student_only(client, actors, role, status, operation):
    login(client, actors, role)
    response = {'get': lambda: client.get('/student/tasks/1/draft'),
        'put': lambda: client.put('/student/tasks/1/draft', json={'source_code': 'x'}),
        'submit': lambda: client.post('/student/tasks/1/submissions', json={'revision': 0}),
        'reveal': lambda: client.post('/student/tasks/1/hints/1/reveal')}[operation]()
    assert response.status_code == status


@pytest.mark.parametrize('state', ['DRAFT', 'archived'])
def test_task_visibility(client, work, db_engine, state):
    path, task_id, _ = work
    with Session(db_engine) as db:
        task = db.get(Task, task_id)
        if state == 'DRAFT': task.status = state
        else: task.is_archived = True
        db.commit()
    assert client.get(path + '/draft').status_code == 404
    assert client.put(path + '/draft', json={'source_code': 'x'}).status_code == 404
    assert client.post(path + '/submissions', json={'revision': 0}).status_code == 404
    assert client.post(path + '/hints/1/reveal').status_code == 404


def test_limits_and_untrusted_client_fields(client, work):
    path, _, runner = work
    for code in ['x' * 102401, '\u0105' * 51201]:
        assert client.put(path + '/draft', json={'source_code': code}).status_code == 422
    for extra in [{'student_id': 1}, {'version': 99}, {'used_hint_ids': [1]}, {'results': []}]:
        assert client.post(path + '/submissions', json={'revision': 0, **extra}).status_code == 422
    assert client.post(path + '/submissions', json={'revision': 999}).status_code == 409
    save(client, path, '')
    assert submit(client, path).status_code == 422
    runner.run_code.assert_not_called()


def test_student_and_task_isolation(client, work, actors, db_engine):
    from app.core.config import get_settings
    from app.core.security import create_access_token
    path, _, _ = work
    first = save(client, path, 'private code')
    client.post(path + '/hints/1/reveal')
    submit(client, path)
    with Session(db_engine) as db:
        user = User(login='second_student', email='second_student@example.com', role=UserRole.STUDENT, password_hash='unused')
        db.add(user); db.commit(); user_id = user.id
    client.cookies.clear(); client.cookies.set(get_settings().cookie_name, create_access_token(user_id))
    other = client.get(path + '/draft').json()
    assert other['id'] != first['id'] and other['source_code'] == "print('starter')"
    assert other['used_hints'] == [] and other['latest_submission'] is None
    login(client, actors, 'TEACHER'); new_task = create(client)
    login(client, actors, 'STUDENT')
    fresh = client.get(f"/student/tasks/{new_task['id']}/draft").json()
    assert fresh['used_hints'] == [] and fresh['latest_submission'] is None and fresh['source_code'] == ''
    assert client.get(path + '/draft').json()['source_code'] == 'private code'


def test_concurrent_version_allocation_and_unique_constraint(client, work, db_engine, actors):
    path, task_id, _ = work
    from app.core.config import get_settings
    from app.core.security import create_access_token
    from fastapi.testclient import TestClient
    revision = client.get(path + '/draft').json()['revision']
    def send(_):
        with TestClient(app) as concurrent_client:
            concurrent_client.cookies.set(get_settings().cookie_name, create_access_token(actors['STUDENT']))
            response = concurrent_client.post(path + '/submissions', json={'revision': revision})
            assert response.status_code == 201, response.text
            return response.json()['submission']['version']
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(send, range(2))) == [1, 2]
    with Session(db_engine) as db:
        db.add(Submission(student_id=actors['STUDENT'], task_id=task_id, version=1, source_code='duplicate', summary={}))
        with pytest.raises(IntegrityError): db.commit()


@pytest.mark.parametrize('operation', ['check', 'submissions'])
def test_edit_during_execution_preserves_new_code_and_binds_result_to_old_code(client, work, db_engine, operation):
    path, task_id, runner = work
    draft = save(client, path, 'code A')
    client.post(path + '/hints/1/reveal')
    calls = []

    async def run(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            with Session(db_engine) as db:
                row = db.get(SolutionDraft, draft['id'])
                row.source_code = 'code B'; row.revision += 1
                hint = db.scalar(select(TaskHint).where(TaskHint.task_id == task_id, TaskHint.position == 2))
                db.add(DraftUsedHint(draft_id=row.id, hint_id=hint.id))
                for test in db.scalars(select(TaskTest).where(TaskTest.task_id == task_id)):
                    test.config = {'input_data': 'changed after start', 'expected_output': 'different'}
                db.commit()
        return {'status': 'completed', 'stdout': 'ok'}

    runner.run_code.side_effect = run
    body = {'revision': draft['revision']}
    if operation == 'check': body['source_code'] = 'code A'
    response = client.post(path + '/' + operation, json=body)
    assert response.status_code == (200 if operation == 'check' else 201)
    current = client.get(path + '/draft').json()
    assert current['source_code'] == 'code B' and not current['check_is_current']
    assert current['last_check']['passed'] == 2
    assert all(call['source_code'] == 'code A' for call in calls)
    if operation == 'submissions':
        with Session(db_engine) as db:
            submission = db.get(Submission, response.json()['submission']['id'])
            assert submission.source_code == 'code A' and submission.summary['passed_tests'] == 2
            hints = list(db.scalars(select(SubmissionUsedHint).where(SubmissionUsedHint.submission_id == submission.id)))
            assert len(hints) == 1


def test_concurrent_draft_creation_and_optimistic_save(db_engine, client, work, actors):
    _, task_id, _ = work

    def initialize(_):
        with Session(db_engine) as db:
            return solutions.draft_for(db, actors['STUDENT'], db.get(Task, task_id)).id

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert len(set(pool.map(initialize, range(2)))) == 1

    def write(source):
        from fastapi import HTTPException
        with Session(db_engine) as db:
            draft = solutions.draft_for(db, actors['STUDENT'], db.get(Task, task_id))
            try:
                solutions.save_code(db, draft, source, revision=0)
                return 200
            except HTTPException as exc:
                return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(write, ['code A', 'code B'])) == [200, 409]
