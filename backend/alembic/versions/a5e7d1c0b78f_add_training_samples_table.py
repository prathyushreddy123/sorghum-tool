"""add training_samples table

Revision ID: a5e7d1c0b78f
Revises: e5f6a7b8c9d0
Create Date: 2026-02-25 13:54:42.290650

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a5e7d1c0b78f'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('training_samples',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('image_id', sa.Integer(), nullable=False),
    sa.Column('severity', sa.Integer(), nullable=False),
    sa.Column('source', sa.String(), nullable=False),
    sa.Column('labeled_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['image_id'], ['images.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('image_id', 'severity', name='uq_training_sample')
    )
    with op.batch_alter_table('training_samples', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_training_samples_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_training_samples_image_id'), ['image_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('training_samples', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_training_samples_image_id'))
        batch_op.drop_index(batch_op.f('ix_training_samples_id'))

    op.drop_table('training_samples')
