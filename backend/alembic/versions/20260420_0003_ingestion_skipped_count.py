"""add skipped_count to ingestion_batches

Revision ID: 0003_ingestion_skipped_count
Revises: 0002_asset_fields
Create Date: 2026-04-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_ingestion_skipped_count"
down_revision = "0002_asset_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ingestion_batches",
        sa.Column("skipped_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("ingestion_batches", "skipped_count")
