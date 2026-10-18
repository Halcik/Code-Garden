"""Teacher-defined progressive hints."""
from alembic import op
import sqlalchemy as sa
revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("task_hints",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("position > 0", name="ck_task_hints_position"),
        sa.CheckConstraint("length(trim(title)) > 0", name="ck_task_hints_title"),
        sa.CheckConstraint("length(trim(content)) > 0", name="ck_task_hints_content"))
    op.create_index("ix_task_hints_task_id", "task_hints", ["task_id"])


def downgrade():
    op.drop_table("task_hints")
