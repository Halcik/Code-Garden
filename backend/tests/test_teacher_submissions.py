"""KAN-38: ownership, immutable snapshots and student/teacher separation."""
import pytest
from sqlalchemy import select, update, event
from sqlalchemy.orm import Session
from app.models.solution import Submission
from app.models.solution import SolutionTestResult
from app.models.task import Task, TaskTest, TaskHint
from app.models.user import User, UserRole, TeacherApproval, AccountStatus
from test_execution_integration import actors, login, create
from test_solution_submissions import work, save, submit


def test_teacher_history_and_snapshots(client, work, actors, db_engine):
    path, task_id, runner = work
    client.post(path + "/hints/1/reveal")
    save(client, path, "print('one')")
    first = submit(client, path).json()
    first_id = first['submission']['id']
    # Even immediately after formal submission, student draft results stay redacted.
    assert first['draft']['last_check']['results'][1].get('details') is None
    save(client, path, "print('two')")
    second_id = submit(client, path).json()['submission']['id']
    save(client, path, "PRIVATE DRAFT")
    login(client, actors, "TEACHER")
    base = f"/teacher/tasks/{task_id}"
    queries = []
    def count_queries(*args):
        queries.append(args[2])
    event.listen(db_engine, 'before_cursor_execute', count_queries)
    try:
        response = client.get(base + "/submissions")
    finally:
        event.remove(db_engine, 'before_cursor_execute', count_queries)
    assert response.status_code == 200 and response.headers['cache-control'] == 'no-store'
    data = response.json()
    assert data['total'] == 1 and len(data['items']) == 1
    item = data['items'][0]
    assert item['submission_count'] == 2 and item['student']['id'] == actors['STUDENT']
    assert item['latest_submission']['id'] == second_id
    assert 'source_code' not in response.text and 'PRIVATE DRAFT' not in response.text
    assert len(queries) <= 5
    history = client.get(base + f"/students/{actors['STUDENT']}/submissions").json()
    assert [v['id'] for v in history['items']] == [second_id, first_id]
    before = client.get(f"/teacher/submissions/{first_id}").json()
    assert before['source_code'] == "print('one')"
    assert before['passed_tests'] == 2 and before['all_passed']
    assert [t['definition']['is_hidden'] for t in before['test_results']] == [False, True]
    assert before['test_results'][1]['definition']['config']['input_data'] == 'SECRET'
    assert before['test_results'][1]['result']['details']['actual_output'] == 'ok'
    assert before['used_hints'][0]['reveal_order'] == 1
    assert before['used_hints'][0]['revealed_at']
    assert before['total_hints'] == 3
    assert client.post(base + '/hints', json={'title': 'New hint', 'content': 'Added later'}).status_code == 201
    with Session(db_engine) as db:
        db.execute(update(TaskTest).where(TaskTest.task_id == task_id).values(config={'input_data': 'new', 'expected_output': 'changed'}))
        db.execute(update(TaskHint).where(TaskHint.task_id == task_id).values(content='Changed hint'))
        db.execute(update(Task).where(Task.id == task_id).values(instructions='Changed instructions'))
        db.commit()
    assert client.get(f"/teacher/submissions/{first_id}").json() == before
    assert runner.run_code.await_count == 4  # Viewing never executes code.
    assert client.get(base + "/students/999999/submissions").json() == {'student': None, 'items': []}


def test_idor_and_roles(client, work, actors, db_engine):
    path, task_id, _ = work
    save(client, path)
    submission_id = submit(client, path).json()['submission']['id']
    urls = [f'/teacher/tasks/{task_id}/submissions',
            f'/teacher/tasks/{task_id}/students/{actors["STUDENT"]}/submissions',
            f'/teacher/submissions/{submission_id}']
    for role in ('STUDENT', 'ADMIN', None):
        login(client, actors, role)
        for url in urls:
            assert client.get(url).status_code == (401 if role is None else 403)
    with Session(db_engine) as db:
        other = User(login='other_kan38', email='other_kan38@example.com', password_hash='unused',
                     role=UserRole.TEACHER, teacher_approval=TeacherApproval.APPROVED)
        db.add(other); db.flush(); other_id = other.id; db.commit()
    login(client, {'other': other_id}, 'other')
    for url in urls:
        assert client.get(url).status_code == 404
    login(client, actors, 'TEACHER')
    assert client.get('/teacher/submissions/9999999').status_code == 404
    assert client.get('/teacher/tasks/9999999/submissions').status_code == 404
    for method in ('patch', 'delete', 'put', 'post'):
        assert getattr(client, method)(urls[-1]).status_code == 405


def test_empty_and_legacy_records(client, actors, db_engine):
    login(client, actors, 'TEACHER')
    task = create(client)
    base = f'/teacher/tasks/{task["id"]}'
    assert client.get(base + '/submissions').json()['items'] == []
    with Session(db_engine) as db:
        row = Submission(student_id=actors['STUDENT'], task_id=task['id'], version=1,
                         source_code='legacy', summary=dict(passed_tests=0, failed_tests=0, total_tests=0, all_passed=False))
        db.add(row); db.flush(); submission_id = row.id
        db.execute(update(User).where(User.id == actors['STUDENT']).values(status=AccountStatus.INACTIVE))
        db.commit()
    try:
        detail = client.get(f'/teacher/submissions/{submission_id}').json()
        assert detail['test_results'] == [] and detail['used_hints'] == []
        assert detail['student']['status'] == 'INACTIVE'
        assert client.get(base + '/submissions?limit=1&offset=1').json()['items'] == []
    finally:
        with Session(db_engine) as db:
            db.execute(update(User).where(User.id == actors['STUDENT']).values(status=AccountStatus.ACTIVE)); db.commit()


@pytest.mark.parametrize('status,stderr', [('execution_error', 'NameError: missing'),
                                         ('time_limit_exceeded', None)])
def test_hidden_execution_failures_are_preserved(client, work, actors, status, stderr):
    path, _, runner = work
    runner.run_code.return_value = dict(status=status, stderr=stderr)
    save(client, path)
    response = submit(client, path).json()
    assert response['draft']['last_check']['results'][1].get('details') is None
    login(client, actors, 'TEACHER')
    detail = client.get(f'/teacher/submissions/{response["submission"]["id"]}').json()
    assert detail['failed_tests'] == 2 and not detail['all_passed']
    execution = detail['test_results'][1]['result']['details']['execution']
    assert execution['status'] == status
    if stderr:
        assert execution['stderr'] == stderr


def test_old_hidden_snapshot_is_not_reconstructed(client, work, actors, db_engine):
    path, _, _ = work
    save(client, path)
    submission_id = submit(client, path).json()['submission']['id']
    with Session(db_engine) as db:
        original = db.get(Submission, submission_id)
        legacy = Submission(student_id=original.student_id, task_id=original.task_id, version=99,
                            source_code=original.source_code, summary=original.summary)
        db.add(legacy); db.flush()
        rows = list(db.scalars(select(SolutionTestResult).where(SolutionTestResult.submission_id == submission_id)))
        for row in rows:
            db.add(SolutionTestResult(submission_id=legacy.id, number=row.number,
                definition={k: v for k, v in row.definition.items() if k != 'teacher_result'},
                student_result=row.student_result))
        submission_id = legacy.id
        db.commit()
    login(client, actors, 'TEACHER')
    detail = client.get(f'/teacher/submissions/{submission_id}').json()
    hidden = detail['test_results'][1]
    assert hidden['definition']['config']['input_data'] == 'SECRET'
    assert hidden['execution_details_available'] is False
    assert hidden['result'].get('details') is None


def test_global_queue_filters_and_ownership(client, work, actors, db_engine):
    path, task_id, _ = work
    client.post(path + '/hints/1/reveal')
    save(client, path)
    first = submit(client, path).json()['submission']['id']
    latest = submit(client, path).json()['submission']['id']
    login(client, actors, 'TEACHER')
    other_task = create(client)
    with Session(db_engine) as db:
        other = User(login='queue_other_teacher', email='queue_other@example.com', password_hash='unused',
                     role=UserRole.TEACHER, teacher_approval=TeacherApproval.APPROVED)
        db.add(other); db.flush()
        foreign = Task(title='Foreign secret', topic='Python', difficulty='EASY', task_type='STANDARD',
                       status='READY', instructions='secret', author_id=other.id)
        db.add(foreign); db.flush(); foreign_id = foreign.id
        summary = dict(passed_tests=1, failed_tests=0, total_tests=1, all_passed=True)
        db.add(Submission(student_id=actors['STUDENT'], task_id=foreign.id, source_code='PRIVATE', version=1, summary=summary))
        db.add(Submission(student_id=actors['STUDENT'], task_id=other_task['id'], source_code='second task', version=1, summary=summary))
        db.commit()
    response = client.get('/teacher/submissions')
    assert response.status_code == 200 and response.headers['cache-control'] == 'no-store'
    data = response.json()
    assert all(row['task']['id'] != foreign_id for row in data['items'])
    row = next(row for row in data['items'] if row['task']['id'] == task_id)
    assert row['submission_count'] == 2 and row['latest_submission']['id'] == latest
    assert row['used_hint_count'] == 1
    assert 'source_code' not in response.text and 'Foreign secret' not in response.text
    filtered = client.get(f'/teacher/submissions?task_id={task_id}').json()
    assert filtered['total'] == 1 and len(filtered['items']) == 1
    assert client.get(f'/teacher/submissions?task_id={foreign_id}').status_code == 404
    assert client.get('/teacher/submissions?q=not-existing-query').json()['total'] == 0
    assert client.get('/teacher/submissions?q=%25').json()['total'] == 0
    assert client.get('/teacher/submissions?limit=1').json()['limit'] == 1
    oldest = client.get('/teacher/submissions?sort=oldest').json()['items']
    newest = client.get('/teacher/submissions?sort=newest').json()['items']
    assert [r['latest_submission']['id'] for r in oldest] == [r['latest_submission']['id'] for r in reversed(newest)]
    assert all(t['id'] != foreign_id for t in data['tasks'])
    for role in ('STUDENT', 'ADMIN', None):
        login(client, actors, role)
        assert client.get('/teacher/submissions').status_code == (401 if role is None else 403)
