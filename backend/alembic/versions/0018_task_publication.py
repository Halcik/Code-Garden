"""Publication workflow and reviewer ownership; preserve existing READY tasks."""
from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None
STATUSES = ("PENDING_TEACHER_REVIEW", "CHANGES_REQUESTED_BY_TEACHER", "PENDING_ADMIN_REVIEW",
            "CHANGES_REQUESTED_BY_ADMIN", "PUBLISHED")


def upgrade():
    for status in STATUSES:
        op.execute(f"ALTER TYPE task_status ADD VALUE IF NOT EXISTS '{status}'")
    op.add_column("tasks", sa.Column("publication_round", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("tasks", sa.Column("publication_submitted_at", sa.DateTime(timezone=True)))
    op.create_table("publication_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reviewer_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("publication_round", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(16), nullable=False),
        sa.Column("decision", sa.String(32), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("task_id", "publication_round", "stage", name="uq_publication_review_stage"),
        sa.CheckConstraint("stage IN ('TEACHER', 'ADMIN')", name="ck_publication_stage"),
        sa.CheckConstraint("decision IN ('ACCEPTED', 'CHANGES_REQUESTED')", name="ck_publication_decision"),
        sa.CheckConstraint("decision != 'CHANGES_REQUESTED' OR length(trim(comment)) > 0", name="ck_publication_comment"))
    op.create_index("ix_publication_reviews_task_id", "publication_reviews", ["task_id"])
    op.execute("""CREATE FUNCTION protect_publication_history() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Publication review history is immutable'; END $$""")
    op.execute("CREATE TRIGGER immutable_publication_history BEFORE UPDATE OR DELETE ON publication_reviews "
               "FOR EACH ROW EXECUTE FUNCTION protect_publication_history()")
    for table in ("solution_drafts", "submissions"):
        op.add_column(table, sa.Column("reviewer_teacher_id", sa.Integer(),
            sa.ForeignKey("users.id", ondelete="RESTRICT")))
        op.create_index(f"ix_{table}_reviewer_teacher_id", table, ["reviewer_teacher_id"])
    op.add_column("submissions", sa.Column("is_catalog_submission", sa.Boolean(), nullable=False, server_default="false"))
    # Only the new review ownership may be filled once; formal snapshot content
    # and test/hint history keep their database-level immutability protection.
    op.execute("""CREATE OR REPLACE FUNCTION protect_solution_history() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        IF TG_TABLE_NAME = 'submissions' THEN
            IF TG_OP = 'UPDATE' THEN
                IF OLD.reviewer_teacher_id IS NULL AND NEW.reviewer_teacher_id IS NOT NULL
                   AND (to_jsonb(OLD) - 'reviewer_teacher_id') = (to_jsonb(NEW) - 'reviewer_teacher_id') THEN
                    RETURN NEW;
                END IF;
            END IF;
            RAISE EXCEPTION 'Solution submission history is immutable';
        ELSIF TG_TABLE_NAME = 'submission_used_hints' THEN
            RAISE EXCEPTION 'Solution submission history is immutable';
        ELSIF OLD.submission_id IS NOT NULL THEN
            RAISE EXCEPTION 'Solution submission history is immutable';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        IF NEW.submission_id IS NOT NULL THEN RAISE EXCEPTION 'Cannot move draft results into history'; END IF;
        RETURN NEW;
    END $$""")
    # Existing snapshots retain their historical owner, even without assignments.
    op.execute("UPDATE submissions s SET reviewer_teacher_id = t.author_id FROM tasks t WHERE t.id = s.task_id")
    op.execute("UPDATE solution_drafts d SET reviewer_teacher_id = t.author_id FROM tasks t "
               "WHERE t.id = d.task_id AND EXISTS (SELECT 1 FROM submissions s "
               "WHERE s.student_id = d.student_id AND s.task_id = d.task_id)")


def downgrade():
    bind = op.get_bind()
    if bind.execute(sa.text("SELECT 1 FROM tasks WHERE status::text NOT IN ('DRAFT','READY') LIMIT 1")).first() or \
       bind.execute(sa.text("SELECT 1 FROM publication_reviews LIMIT 1")).first() or \
       bind.execute(sa.text("SELECT 1 FROM submissions s JOIN tasks t ON t.id=s.task_id "
                            "WHERE s.is_catalog_submission OR s.reviewer_teacher_id IS DISTINCT FROM t.author_id LIMIT 1")).first():
        raise RuntimeError("Cannot downgrade without losing publication history or reviewer access")
    op.drop_column("submissions", "is_catalog_submission")
    for table in ("solution_drafts", "submissions"):
        op.drop_index(f"ix_{table}_reviewer_teacher_id", table)
        op.drop_column(table, "reviewer_teacher_id")
    op.drop_table("publication_reviews")
    op.execute("DROP FUNCTION protect_publication_history()")
    op.drop_column("tasks", "publication_submitted_at")
    op.drop_column("tasks", "publication_round")
    op.execute("""CREATE OR REPLACE FUNCTION protect_solution_history() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        IF TG_TABLE_NAME <> 'solution_test_results' THEN
            RAISE EXCEPTION 'Solution submission history is immutable';
        END IF;
        IF OLD.submission_id IS NOT NULL THEN RAISE EXCEPTION 'Solution submission history is immutable'; END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        IF NEW.submission_id IS NOT NULL THEN RAISE EXCEPTION 'Cannot move draft results into history'; END IF;
        RETURN NEW;
    END $$""")
    # PostgreSQL enum values are retained; removing unused labels requires a type rebuild.
