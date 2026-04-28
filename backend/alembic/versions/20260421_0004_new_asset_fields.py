"""add function, custodian, user_name, license_state fields to assets

Revision ID: 0004_new_asset_fields
Revises: 0003_ingestion_skipped_count
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_new_asset_fields"
down_revision = "0003_ingestion_skipped_count"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Function + Custodian (general assets — excluded for IPPhone / Workstation)
    op.add_column("assets", sa.Column("system_function",    sa.String(255), nullable=True))
    op.add_column("assets", sa.Column("override_function",  sa.String(255), nullable=True))
    op.add_column("assets", sa.Column("system_custodian",   sa.String(255), nullable=True))
    op.add_column("assets", sa.Column("override_custodian", sa.String(255), nullable=True))

    # User field (IPPhone / Workstation only)
    op.add_column("assets", sa.Column("system_user_name",    sa.String(255), nullable=True))
    op.add_column("assets", sa.Column("override_user_name",  sa.String(255), nullable=True))

    # License state fields (Licensed | Unlicensed) for OS, EDR, AV
    op.add_column("assets", sa.Column("system_os_license_state",   sa.String(20), nullable=True))
    op.add_column("assets", sa.Column("override_os_license_state", sa.String(20), nullable=True))
    op.add_column("assets", sa.Column("system_edr_license_state",   sa.String(20), nullable=True))
    op.add_column("assets", sa.Column("override_edr_license_state", sa.String(20), nullable=True))
    op.add_column("assets", sa.Column("system_av_license_state",   sa.String(20), nullable=True))
    op.add_column("assets", sa.Column("override_av_license_state", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("assets", "override_av_license_state")
    op.drop_column("assets", "system_av_license_state")
    op.drop_column("assets", "override_edr_license_state")
    op.drop_column("assets", "system_edr_license_state")
    op.drop_column("assets", "override_os_license_state")
    op.drop_column("assets", "system_os_license_state")
    op.drop_column("assets", "override_user_name")
    op.drop_column("assets", "system_user_name")
    op.drop_column("assets", "override_custodian")
    op.drop_column("assets", "system_custodian")
    op.drop_column("assets", "override_function")
    op.drop_column("assets", "system_function")
