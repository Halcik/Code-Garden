"""Teacher-defined test cases."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("task_tests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("test_type", sa.String(20), nullable=False),
        sa.Column("config", JSONB(), nullable=False),
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("position > 0", name="ck_task_tests_position"),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_task_tests_name"),
        sa.CheckConstraint("test_type IN ('INPUT_OUTPUT', 'FUNCTION', 'STRUCTURAL')", name="ck_task_tests_type"))
    op.create_index("ix_task_tests_task_id", "task_tests", ["task_id"])


def downgrade():
    op.drop_table("task_tests")
