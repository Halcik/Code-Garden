"""Optional deadline on each independent assignment source."""
from alembic import op
import sqlalchemy as sa

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("task_assignments", sa.Column("deadline", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("task_assignments", "deadline")
