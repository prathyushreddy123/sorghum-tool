"""generalize training samples and add training jobs

Revision ID: f6a7b8c9d0e1
Revises: a5e7d1c0b78f
Create Date: 2026-02-25 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'a5e7d1c0b78f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- TrainingJob table ---
    op.create_table(
        'training_jobs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('trait_name', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='queued'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('config', sa.String(), nullable=True),
        sa.Column('metrics', sa.String(), nullable=True),
        sa.Column('model_path', sa.String(), nullable=True),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('sample_count', sa.Integer(), nullable=True),
    )

    # --- Generalize TrainingSample (SQLite requires batch mode) ---
    with op.batch_alter_table('training_samples') as batch_op:
        # Add new columns
        batch_op.add_column(sa.Column('trait_name', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('value', sa.String(), nullable=True))

    # Migrate existing data: severity -> trait_name='ergot_severity', value=str(severity)
    op.execute("UPDATE training_samples SET trait_name = 'ergot_severity', value = CAST(severity AS TEXT)")

    # Make columns non-nullable and drop severity
    with op.batch_alter_table('training_samples') as batch_op:
        batch_op.alter_column('trait_name', nullable=False)
        batch_op.alter_column('value', nullable=False)
        batch_op.drop_constraint('uq_training_sample', type_='unique')
        batch_op.create_unique_constraint('uq_training_sample_trait', ['image_id', 'trait_name'])
        batch_op.drop_column('severity')


def downgrade() -> None:
    with op.batch_alter_table('training_samples') as batch_op:
        batch_op.add_column(sa.Column('severity', sa.Integer(), nullable=True))

    op.execute("UPDATE training_samples SET severity = CAST(value AS INTEGER) WHERE trait_name = 'ergot_severity'")
    op.execute("UPDATE training_samples SET severity = 1 WHERE severity IS NULL")

    with op.batch_alter_table('training_samples') as batch_op:
        batch_op.alter_column('severity', nullable=False)
        batch_op.drop_constraint('uq_training_sample_trait', type_='unique')
        batch_op.create_unique_constraint('uq_training_sample', ['image_id', 'severity'])
        batch_op.drop_column('trait_name')
        batch_op.drop_column('value')

    op.drop_table('training_jobs')
