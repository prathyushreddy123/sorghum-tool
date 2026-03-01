"""add ai prediction tracking to training_samples

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-02-27 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g7b8c9d0e1f2'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('training_samples') as batch_op:
        batch_op.add_column(sa.Column('ai_predicted_value', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('ai_confidence', sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('training_samples') as batch_op:
        batch_op.drop_column('ai_confidence')
        batch_op.drop_column('ai_predicted_value')
