"""Teacher reviews and private teacher/student notes."""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def timestamp(name):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def upgrade():
    op.create_table("submission_reviews", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", sa.Integer(), sa.ForeignKey("submissions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("decision", sa.String(32), nullable=False), sa.Column("feedback", sa.Text(), nullable=False),
        sa.Column("reviewed_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        timestamp("reviewed_at"), timestamp("created_at"), timestamp("updated_at"),
        sa.UniqueConstraint("submission_id", name="uq_review_submission"),
        sa.CheckConstraint("decision IN ('ACCEPTED', 'CHANGES_REQUESTED')", name="ck_review_decision"),
        sa.CheckConstraint("decision != 'CHANGES_REQUESTED' OR length(trim(feedback)) > 0", name="ck_review_feedback"))
    op.create_index("ix_submission_reviews_reviewed_by", "submission_reviews", ["reviewed_by"])
    op.create_table("teacher_student_notes", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False), timestamp("created_at"), timestamp("updated_at"),
        sa.UniqueConstraint("teacher_id", "student_id", name="uq_note_teacher_student"))
    op.create_index("ix_teacher_student_notes_teacher_id", "teacher_student_notes", ["teacher_id"])
    op.create_index("ix_teacher_student_notes_student_id", "teacher_student_notes", ["student_id"])


def downgrade():
    op.drop_table("teacher_student_notes")
    op.drop_table("submission_reviews")
