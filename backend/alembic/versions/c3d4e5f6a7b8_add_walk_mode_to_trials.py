"""add walk_mode to trials

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-02-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns WHERE table_name='trials' AND column_name='walk_mode'"
    ))
    if not result.fetchone():
        op.add_column('trials', sa.Column('walk_mode', sa.String(), server_default='row_by_row'))


def downgrade() -> None:
    op.drop_column('trials', 'walk_mode')
