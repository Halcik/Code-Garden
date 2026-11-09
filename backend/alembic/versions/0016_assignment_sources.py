"""Preserve independent assignment sources and their identity after group deletion."""
from alembic import op
import sqlalchemy as sa

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("task_assignments", sa.Column("source_group_id", sa.Integer(), nullable=True))
    op.execute("UPDATE task_assignments SET source_group_id = group_id")
    op.drop_constraint("uq_task_assignments_task_student", "task_assignments", type_="unique")
    op.create_unique_constraint("uq_task_assignments_source", "task_assignments",
        ["task_id", "student_id", "assigned_by_teacher_id", "source_group_id"], postgresql_nulls_not_distinct=True)
    op.create_check_constraint("ck_task_assignments_source_group", "task_assignments",
        "(source_group_id IS NULL AND group_id IS NULL) OR "
        "(source_group_id IS NOT NULL AND source_group_id > 0 AND (group_id IS NULL OR group_id = source_group_id))")


def downgrade():
    # Refuse a lossy downgrade rather than silently discard independent grants.
    duplicates = op.get_bind().execute(sa.text(
        "SELECT 1 FROM task_assignments GROUP BY task_id, student_id HAVING count(*) > 1 LIMIT 1")).first()
    if duplicates:
        raise RuntimeError("Cannot downgrade: revoke additional assignment sources before restoring task/student uniqueness")
    op.drop_constraint("ck_task_assignments_source_group", "task_assignments", type_="check")
    op.drop_constraint("uq_task_assignments_source", "task_assignments", type_="unique")
    op.create_unique_constraint("uq_task_assignments_task_student", "task_assignments", ["task_id", "student_id"])
    op.drop_column("task_assignments", "source_group_id")
