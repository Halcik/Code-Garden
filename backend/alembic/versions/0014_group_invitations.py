"""Direct group invitations and expiring invitation codes (KAN-44)."""
from alembic import op
import sqlalchemy as sa

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("group_invitations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("student_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invited_by_teacher_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('PENDING', 'ACCEPTED', 'REJECTED')", name="ck_group_invitations_status"))
    op.create_index("ix_group_invitations_group_id", "group_invitations", ["group_id"])
    op.create_index("ix_group_invitations_student_id", "group_invitations", ["student_id"])
    op.create_index("uq_group_invitations_pending", "group_invitations", ["group_id", "student_id"], unique=True,
                    postgresql_where=sa.text("status = 'PENDING'"))
    op.create_table("group_invitation_codes",
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("student_groups.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("expires_at > created_at", name="ck_group_invitation_codes_expiry"))


def downgrade():
    op.drop_table("group_invitation_codes")
    op.drop_table("group_invitations")
