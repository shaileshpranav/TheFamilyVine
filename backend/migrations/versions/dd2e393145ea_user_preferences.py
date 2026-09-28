"""user preferences

Revision ID: dd2e393145ea
Revises: 5436c9281d06
Create Date: 2026-09-26 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dd2e393145ea'
down_revision: Union[str, Sequence[str], None] = '5436c9281d06'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('preferences', sa.JSON(), server_default=sa.text("'{}'"), nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'preferences')
