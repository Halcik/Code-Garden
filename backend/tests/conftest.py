import os
import secrets

os.environ.setdefault("JWT_SECRET", secrets.token_urlsafe(48))
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://unused:unused@localhost/unused")
