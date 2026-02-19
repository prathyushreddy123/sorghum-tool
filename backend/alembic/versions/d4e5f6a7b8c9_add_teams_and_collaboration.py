"""add teams and collaboration

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-02-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)

    if not insp.has_table('teams'):
        op.create_table(
            'teams',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('invite_code', sa.String(), nullable=False, unique=True),
            sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('ix_teams_invite_code', 'teams', ['invite_code'])

    if not insp.has_table('team_members'):
        op.create_table(
            'team_members',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id'), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('joined_at', sa.DateTime(), server_default=sa.func.now()),
            sa.UniqueConstraint('team_id', 'user_id', name='uq_team_member'),
        )
        op.create_index('ix_team_members_team_id', 'team_members', ['team_id'])
        op.create_index('ix_team_members_user_id', 'team_members', ['user_id'])

    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns WHERE table_name='trials' AND column_name='team_id'"
    ))
    if not result.fetchone():
        op.add_column('trials', sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id'), nullable=True))
        op.create_index('ix_trials_team_id', 'trials', ['team_id'])


def downgrade() -> None:
    op.drop_index('ix_trials_team_id', 'trials')
    op.drop_column('trials', 'team_id')
    op.drop_index('ix_team_members_user_id', 'team_members')
    op.drop_index('ix_team_members_team_id', 'team_members')
    op.drop_table('team_members')
    op.drop_index('ix_teams_invite_code', 'teams')
    op.drop_table('teams')
