from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.admin import router as admin_router
from app.api.teacher import router as teacher_router
from app.api.student import router as student_router
from app.api.teacher_submissions import router as teacher_submissions_router
from app.api.teacher_reviews import router as teacher_reviews_router
from app.api.teacher_groups import router as teacher_groups_router
from app.api.task_assignments import router as task_assignments_router
from app.api.group_invitations import teacher_router as teacher_invitations_router, student_router as student_groups_router
from app.core.config import get_settings

settings = get_settings()
app = FastAPI(title="Code Garden Auth", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_credentials=True, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
                   allow_headers=["Content-Type"])
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(teacher_router)
app.include_router(teacher_groups_router)
app.include_router(task_assignments_router)
app.include_router(teacher_invitations_router)
app.include_router(student_groups_router)
app.include_router(teacher_submissions_router)
app.include_router(teacher_reviews_router)
app.include_router(student_router)


@app.get("/health", tags=["health"])
def health():
    """Application liveness; does not claim database readiness."""
    return {"status": "ok"}
