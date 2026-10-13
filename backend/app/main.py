from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.core.config import get_settings

settings = get_settings()
app = FastAPI(title="Code Garden Auth", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_credentials=True, allow_methods=["GET", "POST"],
                   allow_headers=["Content-Type"])
app.include_router(auth_router)


@app.get("/health", tags=["health"])
def health():
    """Application liveness; does not claim database readiness."""
    return {"status": "ok"}
