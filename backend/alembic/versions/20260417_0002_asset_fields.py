"""add status, environment, location fields to assets

Revision ID: 0002_asset_fields
Revises: 0001_initial
Create Date: 2026-04-17
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_asset_fields"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("assets", sa.Column("system_asset_status", sa.String(30), nullable=True))
    op.add_column("assets", sa.Column("override_asset_status", sa.String(30), nullable=True))
    op.add_column("assets", sa.Column("system_environment", sa.String(30), nullable=True))
    op.add_column("assets", sa.Column("override_environment", sa.String(30), nullable=True))
    op.add_column("assets", sa.Column("system_location", sa.String(255), nullable=True))
    op.add_column("assets", sa.Column("override_location", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("assets", "override_location")
    op.drop_column("assets", "system_location")
    op.drop_column("assets", "override_environment")
    op.drop_column("assets", "system_environment")
    op.drop_column("assets", "override_asset_status")
    op.drop_column("assets", "system_asset_status")
