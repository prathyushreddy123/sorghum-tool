"""add crop to training tables and runpod fields to training_jobs

Revision ID: h8c9d0e1f2g3
Revises: g7b8c9d0e1f2
Create Date: 2026-02-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h8c9d0e1f2g3'
down_revision: Union[str, None] = 'g7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add crop to training_samples
    with op.batch_alter_table('training_samples') as batch_op:
        batch_op.add_column(sa.Column('crop', sa.String(), nullable=False, server_default='sorghum'))
        # Drop old unique constraint and add new one with crop
        batch_op.drop_constraint('uq_training_sample_trait', type_='unique')
        batch_op.create_unique_constraint('uq_training_sample_trait_crop', ['image_id', 'trait_name', 'crop'])

    # Add crop, model_url, runpod_job_id to training_jobs
    with op.batch_alter_table('training_jobs') as batch_op:
        batch_op.add_column(sa.Column('crop', sa.String(), nullable=False, server_default='sorghum'))
        batch_op.add_column(sa.Column('model_url', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('runpod_job_id', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('training_jobs') as batch_op:
        batch_op.drop_column('runpod_job_id')
        batch_op.drop_column('model_url')
        batch_op.drop_column('crop')

    with op.batch_alter_table('training_samples') as batch_op:
        batch_op.drop_constraint('uq_training_sample_trait_crop', type_='unique')
        batch_op.create_unique_constraint('uq_training_sample_trait', ['image_id', 'trait_name'])
        batch_op.drop_column('crop')
