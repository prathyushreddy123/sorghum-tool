"""initial schema

Revision ID: 73009a1bf46e
Revises:
Create Date: 2026-02-14 01:13:54.534999

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '73009a1bf46e'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('email', sa.String(), nullable=False, unique=True, index=True),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        'trials',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('crop', sa.String(), default='sorghum'),
        sa.Column('location', sa.String(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
    )

    op.create_table(
        'plots',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('trial_id', sa.Integer(), sa.ForeignKey('trials.id'), nullable=False, index=True),
        sa.Column('plot_id', sa.String(), nullable=False),
        sa.Column('genotype', sa.String(), nullable=False),
        sa.Column('rep', sa.Integer(), nullable=False),
        sa.Column('row', sa.Integer(), nullable=False),
        sa.Column('column', sa.Integer(), nullable=False),
        sa.Column('notes', sa.String(), nullable=True),
    )

    op.create_table(
        'observations',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('plot_id', sa.Integer(), sa.ForeignKey('plots.id'), nullable=False),
        sa.Column('trait_name', sa.String(), nullable=False),
        sa.Column('value', sa.String(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('temperature', sa.Float(), nullable=True),
        sa.Column('humidity', sa.Float(), nullable=True),
    )
    op.create_index('ix_observations_plot_trait', 'observations', ['plot_id', 'trait_name'])

    op.create_table(
        'images',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('plot_id', sa.Integer(), sa.ForeignKey('plots.id'), nullable=False),
        sa.Column('filename', sa.String(), nullable=False, unique=True),
        sa.Column('original_name', sa.String(), nullable=False),
        sa.Column('image_type', sa.String(), nullable=False, server_default='panicle'),
        sa.Column('uploaded_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        'api_keys',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_label', sa.String(), nullable=False),
        sa.Column('key_hash', sa.String(), nullable=False, unique=True, index=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
    )


def downgrade() -> None:
    op.drop_table('api_keys')
    op.drop_table('images')
    op.drop_index('ix_observations_plot_trait', table_name='observations')
    op.drop_table('observations')
    op.drop_table('plots')
    op.drop_table('trials')
    op.drop_table('users')
