"""Student groups and membership relation (KAN-43)."""
from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "student_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_student_groups_name"),
    )
    op.create_index("ix_student_groups_teacher_id", "student_groups", ["teacher_id"])
    op.create_table(
        "group_students",
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("student_groups.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_group_students_student_id", "group_students", ["student_id"])


def downgrade():
    op.drop_table("group_students")
    op.drop_table("student_groups")
