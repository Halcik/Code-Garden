"""Rename the educational task content field, preserving existing content."""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    # Some development databases applied the corrected 0005 before this
    # follow-up revision was introduced. They already use the final name.
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("tasks")}
    if "additional_context" in columns:
        op.alter_column("tasks", "additional_context", new_column_name="instructions",
                        existing_type=sa.Text(), existing_nullable=True)


def downgrade():
    op.alter_column("tasks", "instructions", new_column_name="additional_context",
                    existing_type=sa.Text(), existing_nullable=True)
