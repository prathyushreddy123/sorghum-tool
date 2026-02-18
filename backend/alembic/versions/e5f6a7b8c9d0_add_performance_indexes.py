"""add performance indexes on plot.trial_id, observation.plot_id, and composite (plot_id, scoring_round_id)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-02-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Index on plots.trial_id — used by every single plots list query
    op.create_index('ix_plots_trial_id', 'plots', ['trial_id'])

    # Index on observations.plot_id — used by observation lookups and N+1 batch queries
    op.create_index('ix_observations_plot_id', 'observations', ['plot_id'])

    # Composite index for the most common observation filter pattern:
    # WHERE plot_id IN (...) AND scoring_round_id = ?
    # This is used in get_plots_observed_set, export_trial_csv, get_next_unscored_plot, etc.
    op.create_index(
        'ix_observations_plot_id_round',
        'observations',
        ['plot_id', 'scoring_round_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_observations_plot_id_round', table_name='observations')
    op.drop_index('ix_observations_plot_id', table_name='observations')
    op.drop_index('ix_plots_trial_id', table_name='plots')
