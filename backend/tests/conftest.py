import os
import secrets
import subprocess
import sys
from pathlib import Path

import pytest

os.environ.setdefault("JWT_SECRET", secrets.token_urlsafe(48))
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://unused:unused@localhost/unused")


@pytest.fixture(scope="module")
def db_engine():
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url

    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database ending in _test")
    parsed = make_url(url)
    if not parsed.database or not parsed.database.endswith("_test") or parsed.get_backend_name() != "postgresql":
        pytest.fail("TEST_DATABASE_URL must point to a disposable PostgreSQL database ending in _test")
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"],
                   cwd=Path(__file__).resolve().parents[1],
                   env={**os.environ, "DATABASE_URL": url}, check=True)
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE users RESTART IDENTITY"))
    yield engine
    engine.dispose()


@pytest.fixture(scope="module")
def client(db_engine):
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session
    from app.core.rate_limit import auth_limiter
    from app.db.session import get_db
    from app.main import app

    def override_db():
        with Session(db_engine) as session:
            yield session

    auth_limiter.events.clear()
    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
