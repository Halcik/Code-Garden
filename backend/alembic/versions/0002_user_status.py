"""Add account status and independent teacher approval.

Existing teachers require an explicit administrator decision after this migration.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    status = postgresql.ENUM("ACTIVE", "INACTIVE", name="account_status", create_type=False)
    approval = postgresql.ENUM("PENDING", "APPROVED", "REJECTED", name="teacher_approval", create_type=False)
    status.create(op.get_bind(), checkfirst=True)
    approval.create(op.get_bind(), checkfirst=True)
    op.add_column("users", sa.Column("status", status, nullable=False, server_default="ACTIVE"))
    op.add_column("users", sa.Column("teacher_approval", approval, nullable=True))
    op.execute("UPDATE users SET teacher_approval = 'PENDING' WHERE role = 'TEACHER'")
    op.create_check_constraint(
        "ck_users_teacher_approval", "users",
        "(role = 'TEACHER' AND teacher_approval IS NOT NULL) OR "
        "(role != 'TEACHER' AND teacher_approval IS NULL)",
    )


def downgrade():
    op.drop_constraint("ck_users_teacher_approval", "users", type_="check")
    op.drop_column("users", "teacher_approval")
    op.drop_column("users", "status")
    postgresql.ENUM(name="teacher_approval").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="account_status").drop(op.get_bind(), checkfirst=True)
