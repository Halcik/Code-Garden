"""Create teacher tasks, author validation and automatic update timestamps."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    difficulty = postgresql.ENUM("EASY", "MEDIUM", "HARD", name="task_difficulty", create_type=False)
    task_type = postgresql.ENUM("STANDARD", "FUNCTION", "STRUCTURAL", name="task_type", create_type=False)
    status = postgresql.ENUM("DRAFT", "READY", name="task_status", create_type=False)
    for enum in (difficulty, task_type, status):
        enum.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("topic", sa.String(100), nullable=False),
        sa.Column("difficulty", difficulty, nullable=False),
        sa.Column("task_type", task_type, nullable=False),
        sa.Column("status", status, nullable=False, server_default="DRAFT"),
        sa.Column("estimated_time_minutes", sa.Integer(), nullable=True),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("estimated_time_minutes > 0", name="ck_tasks_positive_time"),
        sa.CheckConstraint("length(trim(title)) > 0", name="ck_tasks_title"),
        sa.CheckConstraint("length(trim(topic)) > 0", name="ck_tasks_topic"),
    )
    op.create_index("ix_tasks_author_id", "tasks", ["author_id"])
    op.execute("""
        CREATE FUNCTION validate_task_author() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            PERFORM 1 FROM users WHERE id = NEW.author_id AND role = 'TEACHER' FOR SHARE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Task author must be a teacher' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END $$
    """)
    op.execute("CREATE TRIGGER tasks_validate_author BEFORE INSERT OR UPDATE OF author_id ON tasks "
               "FOR EACH ROW EXECUTE FUNCTION validate_task_author()")
    op.execute("""
        CREATE FUNCTION protect_task_author_role() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.role != 'TEACHER' AND EXISTS (SELECT 1 FROM tasks WHERE author_id = OLD.id) THEN
                RAISE EXCEPTION 'Task author must remain a teacher' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END $$
    """)
    op.execute("CREATE TRIGGER users_protect_task_author_role BEFORE UPDATE OF role ON users "
               "FOR EACH ROW EXECUTE FUNCTION protect_task_author_role()")
    op.execute("""
        CREATE FUNCTION touch_task_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            NEW.updated_at = statement_timestamp();
            RETURN NEW;
        END $$
    """)
    op.execute("CREATE TRIGGER tasks_touch_updated_at BEFORE UPDATE ON tasks "
               "FOR EACH ROW EXECUTE FUNCTION touch_task_updated_at()")


def downgrade():
    op.execute("DROP TRIGGER users_protect_task_author_role ON users")
    op.drop_table("tasks")
    for name in ("touch_task_updated_at", "protect_task_author_role", "validate_task_author"):
        op.execute(f"DROP FUNCTION {name}()")
    for name in ("task_status", "task_type", "task_difficulty"):
        postgresql.ENUM(name=name).drop(op.get_bind(), checkfirst=True)
