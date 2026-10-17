"""Add learning content and starter code to tasks."""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    for name in ("theory", "additional_context", "starter_code"):
        op.add_column("tasks", sa.Column(name, sa.Text(), nullable=True))


def downgrade():
    for name in ("starter_code", "additional_context", "theory"):
        op.drop_column("tasks", name)
