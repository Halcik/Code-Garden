"""Upgrade populated legacy tables without publishing tasks or losing history."""
from uuid import uuid4
import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from test_assignment_sources_migration import migration


def test_publication_upgrade_preserves_ready_and_legacy_reviewer(db_engine):
    module = migration("0018_task_publication.py")
    with db_engine.connect() as connection:
        transaction = connection.begin()
        try:
            schema = "publication_migration_" + uuid4().hex
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            connection.execute(text("CREATE TYPE task_status AS ENUM ('DRAFT','READY')"))
            connection.execute(text("CREATE TABLE users (id integer PRIMARY KEY)"))
            connection.execute(text("INSERT INTO users VALUES (1), (2)"))
            connection.execute(text("CREATE TABLE tasks (id integer PRIMARY KEY, author_id integer REFERENCES users(id), status task_status NOT NULL)"))
            connection.execute(text("INSERT INTO tasks VALUES (1,1,'READY'),(2,1,'DRAFT')"))
            connection.execute(text("CREATE TABLE solution_drafts (id integer PRIMARY KEY, student_id integer, task_id integer)"))
            connection.execute(text("INSERT INTO solution_drafts VALUES (1,2,1),(2,2,2)"))
            connection.execute(text("CREATE TABLE submissions (id integer PRIMARY KEY, student_id integer, task_id integer, source_code text)"))
            connection.execute(text("INSERT INTO submissions VALUES (1,2,1,'print(1)')"))
            connection.execute(text("CREATE FUNCTION protect_solution_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable'; END $$"))
            connection.execute(text("CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON submissions FOR EACH ROW EXECUTE FUNCTION protect_solution_history()"))
            with Operations.context(MigrationContext.configure(connection)):
                module.upgrade()
                assert connection.execute(text("SELECT status::text, publication_round FROM tasks ORDER BY id")).all() == [("READY", 0), ("DRAFT", 0)]
                assert connection.execute(text("SELECT source_code, reviewer_teacher_id, is_catalog_submission FROM submissions")).one() == ("print(1)", 1, False)
                assert connection.execute(text("SELECT reviewer_teacher_id FROM solution_drafts ORDER BY id")).scalars().all() == [1, None]
                with connection.begin_nested() as nested:
                    with pytest.raises(DBAPIError):
                        connection.execute(text("UPDATE submissions SET source_code='tampered'"))
                    nested.rollback()
                with connection.begin_nested() as nested:
                    with pytest.raises(DBAPIError):
                        connection.execute(text("UPDATE submissions SET reviewer_teacher_id=2"))
                    nested.rollback()
                module.downgrade()
                assert connection.execute(text("SELECT source_code FROM submissions")).scalar_one() == "print(1)"
                with connection.begin_nested() as nested:
                    with pytest.raises(DBAPIError):
                        connection.execute(text("UPDATE submissions SET source_code='tampered'"))
                    nested.rollback()
        finally:
            transaction.rollback()
