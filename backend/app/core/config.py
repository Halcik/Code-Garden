from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8", extra="ignore",
    )
    database_url: str
    jwt_secret: SecretStr
    jwt_expire_minutes: int = Field(default=30, ge=1, le=1440)
    judge0_url: str = "http://localhost:2358"
    judge0_python_languages: dict[str, int | None] = {"3.11": None, "3.12": None, "3.13": None, "3.14": None}
    judge0_poll_interval_ms: int = Field(default=250, ge=1, le=5000)
    judge0_max_wait_seconds: float = Field(default=5, gt=0, le=60)

    @field_validator("judge0_python_languages")
    @classmethod
    def valid_languages(cls, value):
        if any(language_id is not None and language_id <= 0 for language_id in value.values()):
            raise ValueError("Judge0 language IDs must be positive")
        return value

    cookie_secure: bool = False
    cookie_name: str = "access_token"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @field_validator("database_url")
    @classmethod
    def postgres_only(cls, value: str) -> str:
        if not value.startswith("postgresql+psycopg://"):
            raise ValueError("DATABASE_URL must use postgresql+psycopg://")
        return value

    @field_validator("jwt_secret")
    @classmethod
    def strong_secret(cls, value: SecretStr) -> SecretStr:
        secret = value.get_secret_value()
        if len(secret) < 32 or secret.startswith("replace-"):
            raise ValueError("Generate a random JWT_SECRET of at least 32 characters")
        return value

    @field_validator("cors_origins")
    @classmethod
    def explicit_origins(cls, value: list[str]) -> list[str]:
        if not value or any(origin == "*" or not origin.startswith(("http://", "https://")) for origin in value):
            raise ValueError("CORS_ORIGINS requires explicit HTTP(S) origins")
        return [origin.rstrip("/") for origin in value]


@lru_cache
def get_settings() -> Settings:
    return Settings()
