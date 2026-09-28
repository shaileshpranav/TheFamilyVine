"""photos and conditions

Revision ID: 6a7dc61110ac
Revises: dd2e393145ea
Create Date: 2026-09-26 15:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6a7dc61110ac'
down_revision: Union[str, Sequence[str], None] = 'dd2e393145ea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('photos',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('tree_id', sa.Uuid(), nullable=False),
    sa.Column('person_id', sa.Uuid(), nullable=True),
    sa.Column('caption', sa.String(length=500), nullable=False),
    sa.Column('width', sa.Integer(), nullable=False),
    sa.Column('height', sa.Integer(), nullable=False),
    sa.Column('uploaded_by_id', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['person_id'], ['people.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['tree_id'], ['trees.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['uploaded_by_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_photos_tree_id'), 'photos', ['tree_id'], unique=False)
    op.create_index(op.f('ix_photos_person_id'), 'photos', ['person_id'], unique=False)
    op.create_table('conditions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('tree_id', sa.Uuid(), nullable=False),
    sa.Column('person_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('status', sa.Enum('diagnosed', 'carrier', 'watch', 'untested', name='conditionstatus', native_enum=False, length=20), nullable=False),
    sa.Column('year', sa.Integer(), nullable=True),
    sa.Column('note', sa.String(length=500), nullable=False),
    sa.Column('created_by_id', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['person_id'], ['people.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['tree_id'], ['trees.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_conditions_tree_id'), 'conditions', ['tree_id'], unique=False)
    op.create_index(op.f('ix_conditions_person_id'), 'conditions', ['person_id'], unique=False)
    # People and trees point at photos, and photos at them, so these come afterwards.
    with op.batch_alter_table('people') as batch:
        batch.add_column(sa.Column('photo_id', sa.Uuid(), nullable=True))
        batch.create_foreign_key('fk_people_photo_id_photos', 'photos', ['photo_id'], ['id'], ondelete='SET NULL')
    with op.batch_alter_table('trees') as batch:
        batch.add_column(sa.Column('cover_photo_id', sa.Uuid(), nullable=True))
        batch.create_foreign_key('fk_trees_cover_photo_id_photos', 'photos', ['cover_photo_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('trees') as batch:
        batch.drop_constraint('fk_trees_cover_photo_id_photos', type_='foreignkey')
        batch.drop_column('cover_photo_id')
    with op.batch_alter_table('people') as batch:
        batch.drop_constraint('fk_people_photo_id_photos', type_='foreignkey')
        batch.drop_column('photo_id')
    op.drop_index(op.f('ix_conditions_person_id'), table_name='conditions')
    op.drop_index(op.f('ix_conditions_tree_id'), table_name='conditions')
    op.drop_table('conditions')
    op.drop_index(op.f('ix_photos_person_id'), table_name='photos')
    op.drop_index(op.f('ix_photos_tree_id'), table_name='photos')
    op.drop_table('photos')
