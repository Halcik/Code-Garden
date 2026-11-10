"""Age range and motivation defaults for groups."""
from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("student_groups", sa.Column("age_range", sa.String(50), nullable=True))
    op.add_column("student_groups", sa.Column("achievements_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("student_groups", sa.Column("study_streak_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column("student_groups", "study_streak_enabled")
    op.drop_column("student_groups", "achievements_enabled")
    op.drop_column("student_groups", "age_range")
