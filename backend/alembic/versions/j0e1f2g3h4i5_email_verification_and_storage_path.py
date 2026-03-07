"""add email verification, storage_path on images

Revision ID: j0e1f2g3h4i5
Revises: i9d0e1f2g3h4
Create Date: 2026-03-06
"""
from alembic import op
import sqlalchemy as sa

revision = "j0e1f2g3h4i5"
down_revision = "i9d0e1f2g3h4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # User email verification fields
    op.add_column("users", sa.Column("email_verified", sa.Boolean(), server_default=sa.text("0"), nullable=False))
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("verification_grace_expires", sa.DateTime(), nullable=True))

    # Grandfather existing users as verified
    op.execute("UPDATE users SET email_verified = 1")

    # Email verification tokens table
    op.create_table(
        "email_verification_tokens",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(), nullable=False, unique=True, index=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    # Image storage_path
    op.add_column("images", sa.Column("storage_path", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("images", "storage_path")
    op.drop_table("email_verification_tokens")
    op.drop_column("users", "verification_grace_expires")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "email_verified")
