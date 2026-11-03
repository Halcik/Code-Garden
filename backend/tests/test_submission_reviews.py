"""KAN-39 lifecycle, privacy, ownership and database constraints."""
from concurrent.futures import ThreadPoolExecutor
import pytest
from sqlalchemy import select, func, update, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.models.review import SubmissionReview, TeacherStudentNote
from app.models.solution import Submission, SolutionDraft
from app.models.task import Task
from app.models.user import User, UserRole, TeacherApproval
from test_execution_integration import actors, login, create
from test_solution_submissions import work, save, submit


def review_url(submission_id):
    return f'/teacher/submissions/{submission_id}/review'


@pytest.fixture(autouse=True)
def isolated_notes(db_engine):
    with Session(db_engine) as db:
        db.execute(delete(TeacherStudentNote))
        db.commit()


def test_review_lifecycle_and_student_feedback(client, work, actors, db_engine):
    path, task_id, runner = work
    save(client, path, "print('one')")
    one = submit(client, path).json()['submission']
    assert one['review'] == dict(status='PENDING', feedback='', reviewed_at=None)
    assert next(item for item in client.get('/student/tasks').json()['items'] if item['id'] == task_id)['review_status'] == 'PENDING'
    login(client, actors, 'TEACHER')
    before = client.get(f'/teacher/submissions/{one["id"]}').json()
    response = client.put(review_url(one['id']), json={'decision': 'CHANGES_REQUESTED', 'feedback': '  Improve naming  '})
    assert response.status_code == 200 and response.headers['cache-control'] == 'no-store'
    assert response.json()['status'] == 'CHANGES_REQUESTED' and response.json()['feedback'] == 'Improve naming'
    first_time = response.json()['reviewed_at']
    after = client.get(f'/teacher/submissions/{one["id"]}').json()
    assert {k: v for k, v in before.items() if k != 'review'} == {k: v for k, v in after.items() if k != 'review'}
    assert client.get(f'/teacher/tasks/{task_id}/students/{actors["STUDENT"]}/submissions').json()['items'][0]['review']['status'] == 'CHANGES_REQUESTED'
    note_url = f'/teacher/students/{actors["STUDENT"]}/note'
    assert client.put(note_url, json={'content': 'PRIVATE NOTE SECRET'}).status_code == 200
    login(client, actors, 'STUDENT')
    draft_before = client.get(path + '/draft').json()
    assert draft_before['latest_submission']['review']['status'] == 'CHANGES_REQUESTED'
    assert next(item for item in client.get('/student/tasks').json()['items'] if item['id'] == task_id)['review_status'] == 'CHANGES_REQUESTED'
    assert draft_before['latest_feedback']['version'] == 1
    assert draft_before['latest_feedback']['feedback'] == 'Improve naming'
    assert 'PRIVATE NOTE SECRET' not in str(draft_before)
    save(client, path, "print('two')")
    two_response = submit(client, path)
    assert two_response.status_code == 201
    two = two_response.json()['submission']
    assert two['version'] == 2 and two['review']['status'] == 'PENDING' and two['review']['feedback'] == ''
    assert next(item for item in client.get('/student/tasks').json()['items'] if item['id'] == task_id)['review_status'] == 'PENDING'
    assert two_response.json()['draft']['latest_feedback']['version'] == 1
    login(client, actors, 'TEACHER')
    assert client.get(f'/teacher/submissions/{one["id"]}').json()['review'] == after['review']
    accepted = client.put(review_url(two['id']), json={'decision': 'ACCEPTED', 'feedback': 'Good work'}).json()
    assert accepted['status'] == 'ACCEPTED'
    # Decision changes replace one row and retain automatic results and the draft.
    changed = client.put(review_url(one['id']), json={'decision': 'ACCEPTED'}).json()
    assert changed['feedback'] == '' and changed['reviewed_at'] >= first_time
    with Session(db_engine) as db:
        assert db.scalar(select(func.count()).select_from(SubmissionReview).where(SubmissionReview.submission_id == one['id'])) == 1
        assert db.scalar(select(SolutionDraft.source_code).where(SolutionDraft.task_id == task_id)) == "print('two')"
    assert client.get(note_url).json()['content'] == 'PRIVATE NOTE SECRET'
    assert runner.run_code.await_count == 4
    login(client, actors, 'STUDENT')
    draft = client.get(path + '/draft').json()
    assert draft['latest_submission']['review']['status'] == 'ACCEPTED'
    assert next(item for item in client.get('/student/tasks').json()['items'] if item['id'] == task_id)['review_status'] == 'ACCEPTED'
    assert draft['latest_feedback']['version'] == 2 and draft['latest_feedback']['feedback'] == 'Good work'
    three = submit(client, path).json()
    assert three['submission']['review']['status'] == 'PENDING'  # Acceptance never blocks resubmission.
    assert three['draft']['latest_feedback']['version'] == 2
    for endpoint in [path, path + '/draft', '/student/tasks']:
        response = client.get(endpoint)
        assert response.status_code == 200
        assert 'PRIVATE NOTE SECRET' not in response.text and 'teacher_student_notes' not in response.text


@pytest.mark.parametrize('payload', [
    {'decision': 'PENDING'}, {'decision': 'BAD'}, {'decision': 'CHANGES_REQUESTED'},
    {'decision': 'CHANGES_REQUESTED', 'feedback': ' \n '},
    {'decision': 'ACCEPTED', 'feedback': 'x' * 10001},
    {'decision': 'ACCEPTED', 'teacher_id': 1}, {'decision': 'ACCEPTED', 'student_id': 1},
])
def test_review_validation(client, work, actors, payload):
    path, _, _ = work
    save(client, path)
    submission_id = submit(client, path).json()['submission']['id']
    login(client, actors, 'TEACHER')
    assert client.put(review_url(submission_id), json=payload).status_code == 422
    assert client.get(f'/teacher/submissions/{submission_id}').json()['review']['status'] == 'PENDING'


def test_roles_and_idor(client, work, actors, db_engine):
    path, _, _ = work
    save(client, path)
    submission_id = submit(client, path).json()['submission']['id']
    note_url = f'/teacher/students/{actors["STUDENT"]}/note'
    for role in ('STUDENT', 'ADMIN', None):
        login(client, actors, role)
        expected = 401 if role is None else 403
        assert client.put(review_url(submission_id), json={'decision': 'ACCEPTED'}).status_code == expected
        assert client.get(note_url).status_code == expected
        assert client.put(note_url, json={'content': 'x'}).status_code == expected
    with Session(db_engine) as db:
        other = User(login='review_other', email='review_other@example.com', role=UserRole.TEACHER,
                     password_hash='unused', teacher_approval=TeacherApproval.APPROVED)
        db.add(other); db.flush(); other_id = other.id; db.commit()
    login(client, {'other': other_id}, 'other')
    assert client.put(review_url(submission_id), json={'decision': 'ACCEPTED'}).status_code == 404
    assert client.get(note_url).status_code == 404
    assert client.put(note_url, json={'content': 'x'}).status_code == 404
    login(client, actors, 'TEACHER')
    assert client.put(review_url(9999999), json={'decision': 'ACCEPTED'}).status_code == 404
    assert client.get('/teacher/students/999999/note').status_code == 404
    assert client.put(note_url, json={'content': 'x', 'teacher_id': other_id}).status_code == 422
    assert client.put(note_url, json={'content': 'x', 'student_id': 999999}).status_code == 422
    assert client.put(note_url, json={'content': 'x' * 10001}).status_code == 422
    assert client.put(review_url(submission_id), json={'decision': 'ACCEPTED'}, headers={'Origin': 'https://evil.example'}).status_code == 403
    assert client.put(note_url, json={'content': 'x'}, headers={'Origin': 'https://evil.example'}).status_code == 403


def test_notes_are_independent_of_task_submission_and_teacher(client, work, actors, db_engine):
    path, _, _ = work
    save(client, path)
    first_id = submit(client, path).json()['submission']['id']
    login(client, actors, 'TEACHER')
    url = f'/teacher/students/{actors["STUDENT"]}/note'
    assert client.get(url).json()['content'] == ''
    first = client.put(url, json={'content': 'First note'}).json()
    second = client.put(url, json={'content': 'Updated note'}).json()
    assert second['updated_at'] >= first['updated_at']
    another = create(client)
    with Session(db_engine) as db:
        summary = dict(passed_tests=0, failed_tests=0, total_tests=0, all_passed=False)
        db.add(Submission(student_id=actors['STUDENT'], task_id=another['id'], version=1, source_code='other', summary=summary))
        other = User(login='note_other', email='note_other@example.com', role=UserRole.TEACHER,
                     password_hash='unused', teacher_approval=TeacherApproval.APPROVED)
        db.add(other); db.flush(); other_id = other.id
        other_task = Task(title='Other', topic='Python', task_type='STANDARD', difficulty='EASY', status='READY', instructions='x', author_id=other_id)
        db.add(other_task); db.flush()
        db.add(Submission(student_id=actors['STUDENT'], task_id=other_task.id, version=1, source_code='other teacher', summary=summary))
        db.commit()
    client.get(f'/teacher/submissions/{first_id}')
    assert client.get(url).json()['content'] == 'Updated note'
    client.get(f'/teacher/tasks/{another["id"]}/students/{actors["STUDENT"]}/submissions')
    assert client.get(url).json()['content'] == 'Updated note'
    login(client, {'other': other_id}, 'other')
    assert client.get(url).json()['content'] == ''
    assert client.put(url, json={'content': 'Other private note'}).status_code == 200
    login(client, actors, 'TEACHER')
    assert client.get(url).json()['content'] == 'Updated note'
    assert client.put(url, json={'content': ''}).json()['content'] == ''
    with Session(db_engine) as db:
        assert db.scalar(select(func.count()).select_from(TeacherStudentNote).where(TeacherStudentNote.teacher_id == actors['TEACHER'], TeacherStudentNote.student_id == actors['STUDENT'])) == 1
        assert db.scalar(select(func.count()).select_from(TeacherStudentNote).where(TeacherStudentNote.student_id == actors['STUDENT'])) == 2


def test_queue_filters_use_review_of_latest_version(client, work, actors):
    path, task_id, _ = work
    save(client, path)
    submission_id = submit(client, path).json()['submission']['id']
    login(client, actors, 'TEACHER')
    base = f'/teacher/submissions?task_id={task_id}&review_status='
    assert client.get(base + 'PENDING').json()['total'] == 1
    assert client.get(base + 'ACCEPTED').json()['total'] == 0
    client.put(review_url(submission_id), json={'decision': 'ACCEPTED'})
    assert client.get(base + 'PENDING').json()['total'] == 0
    assert client.get(base + 'ACCEPTED').json()['total'] == 1
    client.put(review_url(submission_id), json={'decision': 'CHANGES_REQUESTED', 'feedback': 'Fix'})
    assert client.get(base + 'CHANGES_REQUESTED').json()['total'] == 1
    login(client, actors, 'STUDENT')
    submit(client, path)
    login(client, actors, 'TEACHER')
    assert client.get(base + 'PENDING').json()['total'] == 1
    assert client.get(base + 'CHANGES_REQUESTED').json()['total'] == 0


def test_teacher_can_accept_failed_tests_without_changing_them(client, work, actors):
    path, _, runner = work
    runner.run_code.return_value = dict(status='completed', stdout='wrong')
    save(client, path)
    submission = submit(client, path).json()['submission']
    assert submission['all_passed'] is False and submission['passed_tests'] == 0
    login(client, actors, 'TEACHER')
    assert client.put(review_url(submission['id']), json={'decision': 'ACCEPTED'}).status_code == 200
    login(client, actors, 'STUDENT')
    draft = client.get(path + '/draft').json()
    assert draft['latest_submission']['review']['status'] == 'ACCEPTED'
    assert draft['latest_submission']['passed_tests'] == 0 and draft['last_check']['all_passed'] is False


def test_concurrent_upserts_and_constraints(client, work, actors, db_engine):
    path, _, _ = work
    save(client, path)
    submission_id = submit(client, path).json()['submission']['id']
    login(client, actors, 'TEACHER')
    url = f'/teacher/students/{actors["STUDENT"]}/note'
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert all(r.status_code == 200 for r in pool.map(lambda _: client.put(review_url(submission_id), json={'decision': 'ACCEPTED'}), range(2)))
        assert all(r.status_code == 200 for r in pool.map(lambda n: client.put(url, json={'content': str(n)}), range(2)))
    with Session(db_engine) as db:
        assert db.scalar(select(func.count()).select_from(SubmissionReview).where(SubmissionReview.submission_id == submission_id)) == 1
        db.add(SubmissionReview(submission_id=submission_id, decision='ACCEPTED', feedback='', reviewed_by=actors['TEACHER']))
        with pytest.raises(IntegrityError): db.commit()
        db.rollback()
        db.add(TeacherStudentNote(teacher_id=actors['TEACHER'], student_id=actors['STUDENT'], content='duplicate'))
        with pytest.raises(IntegrityError): db.commit()
        db.rollback()
        with pytest.raises(IntegrityError):
            db.execute(update(SubmissionReview).where(SubmissionReview.submission_id == submission_id).values(decision='CHANGES_REQUESTED', feedback=''))
            db.commit()
