"""Regression coverage for databases that already applied either version of 0005."""
import importlib.util
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import inspect, text


@pytest.mark.parametrize("original_column", ["additional_context", "instructions"])
def test_instructions_migration_preserves_content_and_supports_downgrade(db_engine, original_column):
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0006_task_instructions.py"
    spec = importlib.util.spec_from_file_location("task_instructions_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    # Use an isolated schema and rollback so existing test tables are untouched.
    with db_engine.connect() as connection:
        transaction = connection.begin()
        try:
            schema = "migration_" + uuid4().hex
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            connection.execute(text(f"CREATE TABLE tasks (id integer PRIMARY KEY, description text, "
                                    f"theory text, {original_column} text, starter_code text)"))
            content = {"summary": "Short summary", "theory": "Theory", "instructions": "Solve this task",
                       "code": "    print('hello')\n\n"}
            connection.execute(text(f"INSERT INTO tasks VALUES (1, :summary, :theory, :instructions, :code)"), content)
            connection.execute(text("INSERT INTO tasks (id) VALUES (2)"))
            before = connection.execute(text("SELECT * FROM tasks ORDER BY id")).all()

            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
                columns = {column["name"] for column in inspect(connection).get_columns("tasks")}
                assert "instructions" in columns
                assert "additional_context" not in columns
                assert connection.execute(text("SELECT * FROM tasks ORDER BY id")).all() == before
                assert connection.execute(text("SELECT instructions FROM tasks WHERE id=1")).scalar_one() == content["instructions"]

                migration.downgrade()
                assert "additional_context" in {column["name"] for column in inspect(connection).get_columns("tasks")}
                assert connection.execute(text("SELECT * FROM tasks ORDER BY id")).all() == before
                migration.upgrade()
                assert connection.execute(text("SELECT * FROM tasks ORDER BY id")).all() == before
        finally:
            transaction.rollback()
