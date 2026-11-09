"""Individual task assignments, including group snapshots (KAN-45)."""
from alembic import op
import sqlalchemy as sa

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("task_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assigned_by_teacher_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("student_groups.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("task_id", "student_id", name="uq_task_assignments_task_student"))
    for column in ("student_id", "assigned_by_teacher_id", "group_id"):
        op.create_index(f"ix_task_assignments_{column}", "task_assignments", [column])


def downgrade():
    op.drop_table("task_assignments")
