"""add multi-crop support: traits, scoring rounds, plot attributes, plot status

Revision ID: b2c3d4e5f6a7
Revises: 73009a1bf46e
Create Date: 2026-02-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = '73009a1bf46e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(conn, table, column):
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": column})
    return result.fetchone() is not None


def upgrade() -> None:
    conn = op.get_bind()

    # --- traits (global library) ---
    if not sa.inspect(conn).has_table('traits'):
        op.create_table(
            'traits',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('name', sa.String(), nullable=False, unique=True),
            sa.Column('label', sa.String(), nullable=False),
            sa.Column('data_type', sa.String(), nullable=False),
            sa.Column('unit', sa.String(), nullable=True),
            sa.Column('min_value', sa.Float(), nullable=True),
            sa.Column('max_value', sa.Float(), nullable=True),
            sa.Column('categories', sa.String(), nullable=True),
            sa.Column('category_labels', sa.String(), nullable=True),
            sa.Column('description', sa.String(), nullable=True),
            sa.Column('crop_hint', sa.String(), nullable=True),
            sa.Column('is_system', sa.Boolean(), default=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        )

    # --- trial_traits (join table) ---
    if not sa.inspect(conn).has_table('trial_traits'):
        op.create_table(
            'trial_traits',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('trial_id', sa.Integer(), sa.ForeignKey('trials.id'), nullable=False, index=True),
            sa.Column('trait_id', sa.Integer(), sa.ForeignKey('traits.id'), nullable=False),
            sa.Column('display_order', sa.Integer(), default=0),
            sa.UniqueConstraint('trial_id', 'trait_id', name='uq_trial_trait'),
        )

    # --- scoring_rounds ---
    if not sa.inspect(conn).has_table('scoring_rounds'):
        op.create_table(
            'scoring_rounds',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('trial_id', sa.Integer(), sa.ForeignKey('trials.id'), nullable=False, index=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('scored_at', sa.Date(), nullable=True),
            sa.Column('notes', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        )

    # --- plot_attributes ---
    if not sa.inspect(conn).has_table('plot_attributes'):
        op.create_table(
            'plot_attributes',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('plot_id', sa.Integer(), sa.ForeignKey('plots.id'), nullable=False, index=True),
            sa.Column('key', sa.String(), nullable=False),
            sa.Column('value', sa.String(), nullable=False),
            sa.UniqueConstraint('plot_id', 'key', name='uq_plot_attribute'),
        )

    # --- add columns to existing tables (idempotent) ---
    if not _column_exists(conn, 'users', 'role'):
        op.add_column('users', sa.Column('role', sa.String(), server_default='admin'))
    if not _column_exists(conn, 'plots', 'plot_status'):
        op.add_column('plots', sa.Column('plot_status', sa.String(), server_default='active'))
    if not _column_exists(conn, 'observations', 'trait_id'):
        op.add_column(
            'observations',
            sa.Column('trait_id', sa.Integer(), sa.ForeignKey('traits.id'), nullable=True),
        )
    if not _column_exists(conn, 'observations', 'scoring_round_id'):
        op.add_column(
            'observations',
            sa.Column('scoring_round_id', sa.Integer(), sa.ForeignKey('scoring_rounds.id'), nullable=True),
        )
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_observations_trait_round ON observations (trait_id, scoring_round_id)"
    ))


def downgrade() -> None:
    op.drop_index('ix_observations_trait_round', table_name='observations')
    op.drop_column('observations', 'scoring_round_id')
    op.drop_column('observations', 'trait_id')
    op.drop_column('plots', 'plot_status')
    op.drop_column('users', 'role')
    op.drop_table('plot_attributes')
    op.drop_table('scoring_rounds')
    op.drop_table('trial_traits')
    op.drop_table('traits')
