"""Upgrade existing 0015 rows without losing identity, dates or deleted sources."""
import importlib.util
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text


def migration(filename):
    path = Path(__file__).resolve().parents[1] / "alembic/versions" / filename
    spec = importlib.util.spec_from_file_location(filename, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_assignment_sources_upgrade_backfills_and_preserves_rows(db_engine):
    old = migration("0015_task_assignments.py")
    new = migration("0016_assignment_sources.py")
    with db_engine.connect() as connection:
        transaction = connection.begin()
        try:
            schema = "migration_" + uuid4().hex
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            for table in ("users", "tasks", "student_groups"):
                connection.execute(text(f"CREATE TABLE {table} (id integer PRIMARY KEY)"))
                connection.execute(text(f"INSERT INTO {table} VALUES (1), (2), (3)"))
            with Operations.context(MigrationContext.configure(connection)):
                old.upgrade()
                connection.execute(text("INSERT INTO task_assignments (id, task_id, student_id, assigned_by_teacher_id, group_id) "
                    "VALUES (10, 1, 1, 2, 1), (11, 2, 1, 2, NULL)"))
                before = connection.execute(text("SELECT id, task_id, student_id, assigned_by_teacher_id, group_id, created_at FROM task_assignments ORDER BY id")).all()
                new.upgrade()
                assert connection.execute(text("SELECT id, task_id, student_id, assigned_by_teacher_id, group_id, created_at FROM task_assignments ORDER BY id")).all() == before
                assert connection.execute(text("SELECT source_group_id FROM task_assignments ORDER BY id")).scalars().all() == [1, None]
                # A second group and a direct grant coexist with the original group.
                connection.execute(text("INSERT INTO task_assignments (id, task_id, student_id, assigned_by_teacher_id, group_id, source_group_id) "
                    "VALUES (12, 1, 1, 2, 2, 2), (13, 1, 1, 2, NULL, NULL)"))
                connection.execute(text("DELETE FROM student_groups WHERE id IN (1, 2)"))
                assert connection.execute(text("SELECT group_id, source_group_id FROM task_assignments WHERE task_id=1 ORDER BY id")).all() == [(None, 1), (None, 2), (None, None)]
                # NULL must still deduplicate a repeated direct source.
                with connection.begin_nested() as nested:
                    from sqlalchemy.exc import IntegrityError
                    with pytest.raises(IntegrityError):
                        connection.execute(text("INSERT INTO task_assignments (id, task_id, student_id, assigned_by_teacher_id) VALUES (14, 1, 1, 2)"))
                    nested.rollback()
                with pytest.raises(RuntimeError, match="Cannot downgrade"):
                    new.downgrade()
                connection.execute(text("DELETE FROM task_assignments WHERE id IN (12, 13)"))
                new.downgrade()
                new.upgrade()
                assert connection.execute(text("SELECT count(*) FROM task_assignments")).scalar_one() == 2
        finally:
            transaction.rollback()
