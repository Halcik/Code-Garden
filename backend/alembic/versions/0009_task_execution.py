"""Task execution settings."""
from alembic import op
import sqlalchemy as sa
revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("tasks", sa.Column("python_version", sa.String(20), nullable=False, server_default="3.13"))
    op.add_column("tasks", sa.Column("time_limit_seconds", sa.Float(), nullable=False, server_default="2"))
    op.add_column("tasks", sa.Column("memory_limit_mb", sa.Integer(), nullable=False, server_default="256"))
    op.create_check_constraint("ck_tasks_cpu_limit", "tasks", "time_limit_seconds > 0 AND time_limit_seconds <= 15")
    op.create_check_constraint("ck_tasks_memory_limit", "tasks", "memory_limit_mb > 0 AND memory_limit_mb <= 512")

def downgrade():
    op.drop_constraint("ck_tasks_memory_limit", "tasks")
    op.drop_constraint("ck_tasks_cpu_limit", "tasks")
    for name in ("memory_limit_mb", "time_limit_seconds", "python_version"):
        op.drop_column("tasks", name)
