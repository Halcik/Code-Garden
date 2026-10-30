"""Persistent drafts, hint usage and formal solution snapshots."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def identity():
    return sa.Column("id", sa.Integer(), primary_key=True)


def reference(name, target, deletion="RESTRICT", nullable=False):
    return sa.Column(name, sa.Integer(), sa.ForeignKey(target, ondelete=deletion), nullable=nullable, index=True)


def timestamp(name):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def upgrade():
    op.create_table("solution_drafts", identity(), reference("student_id", "users.id"), reference("task_id", "tasks.id"),
        sa.Column("source_code", sa.Text(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("check_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("checked_hash", sa.String(64)), sa.Column("checked_at", sa.DateTime(timezone=True)),
        sa.Column("check_summary", JSONB()), timestamp("created_at"), timestamp("updated_at"),
        sa.UniqueConstraint("student_id", "task_id", name="uq_draft_student_task"))
    op.create_table("draft_used_hints", identity(), reference("draft_id", "solution_drafts.id", "CASCADE"),
        reference("hint_id", "task_hints.id", "CASCADE"), timestamp("revealed_at"),
        sa.UniqueConstraint("draft_id", "hint_id", name="uq_draft_hint"))
    op.create_table("submissions", identity(), reference("student_id", "users.id"), reference("task_id", "tasks.id"),
        sa.Column("version", sa.Integer(), nullable=False), sa.Column("source_code", sa.Text(), nullable=False),
        sa.Column("summary", JSONB(), nullable=False), timestamp("submitted_at"),
        sa.UniqueConstraint("student_id", "task_id", "version", name="uq_submission_version"),
        sa.CheckConstraint("version > 0", name="ck_submission_version"))
    op.create_table("submission_used_hints", identity(), reference("submission_id", "submissions.id"),
        sa.Column("hint_id", sa.Integer(), nullable=False), sa.Column("reveal_order", sa.Integer(), nullable=False),
        sa.Column("revealed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("submission_id", "hint_id", name="uq_submission_hint"))
    op.create_table("solution_test_results", identity(),
        reference("draft_id", "solution_drafts.id", "CASCADE", True), reference("submission_id", "submissions.id", nullable=True),
        sa.Column("number", sa.Integer(), nullable=False), sa.Column("definition", JSONB(), nullable=False),
        sa.Column("student_result", JSONB(), nullable=False),
        sa.CheckConstraint("(draft_id IS NULL) <> (submission_id IS NULL)", name="ck_result_owner"))
    # Enforce immutable history even for accidental ORM updates / direct SQL.
    op.execute("""CREATE FUNCTION protect_solution_history() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        IF TG_TABLE_NAME <> 'solution_test_results' OR OLD.submission_id IS NOT NULL THEN
            RAISE EXCEPTION 'Solution submission history is immutable';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        IF NEW.submission_id IS NOT NULL THEN RAISE EXCEPTION 'Cannot move draft results into history'; END IF;
        RETURN NEW;
    END $$""")
    for table in ("submissions", "submission_used_hints", "solution_test_results"):
        op.execute(f"CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION protect_solution_history()")


def downgrade():
    for table in ("solution_test_results", "submission_used_hints", "submissions"):
        op.execute(f"DROP TRIGGER immutable_history ON {table}")
    op.execute("DROP FUNCTION protect_solution_history()")
    for table in ("solution_test_results", "submission_used_hints", "submissions", "draft_used_hints", "solution_drafts"):
        op.drop_table(table)
