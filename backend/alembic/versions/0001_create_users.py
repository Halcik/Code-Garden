"""Create users and user_role enum."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    role = postgresql.ENUM("STUDENT", "TEACHER", "ADMIN", name="user_role", create_type=False)
    role.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("login", sa.String(50), nullable=False),
        sa.Column("email", sa.String(254), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", role, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("login", name="uq_users_login"),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.CheckConstraint("role != 'TEACHER' OR email IS NOT NULL", name="ck_users_teacher_email"),
    )


def downgrade():
    op.drop_table("users")
    postgresql.ENUM(name="user_role").drop(op.get_bind(), checkfirst=True)
