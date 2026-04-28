"""add vulnerabilities and nessus_sync_logs tables

Revision ID: 0005_nessus_tables
Revises: 0004_new_asset_fields
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_nessus_tables"
down_revision = "0004_new_asset_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "nessus_sync_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("started_at", sa.DateTime, nullable=False),
        sa.Column("finished_at", sa.DateTime, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column("scan_id", sa.Integer, nullable=True),
        sa.Column("scans_processed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("assets_matched", sa.Integer, nullable=False, server_default="0"),
        sa.Column("vulns_created", sa.Integer, nullable=False, server_default="0"),
        sa.Column("vulns_updated", sa.Integer, nullable=False, server_default="0"),
        sa.Column("error", sa.Text, nullable=True),
    )

    op.create_table(
        "vulnerabilities",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("asset_id", sa.Integer, sa.ForeignKey("assets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("plugin_id", sa.Integer, nullable=False),
        sa.Column("plugin_name", sa.String(500), nullable=False),
        sa.Column("plugin_family", sa.String(200), nullable=True),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("severity_id", sa.Integer, nullable=False),
        sa.Column("cvss_score", sa.Float, nullable=True),
        sa.Column("cvss_v3_score", sa.Float, nullable=True),
        sa.Column("cve_id", sa.String(100), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("solution", sa.Text, nullable=True),
        sa.Column("see_also", sa.Text, nullable=True),
        sa.Column("port", sa.Integer, nullable=True),
        sa.Column("protocol", sa.String(10), nullable=True),
        sa.Column("service", sa.String(100), nullable=True),
        sa.Column("source_scan_id", sa.Integer, nullable=False),
        sa.Column("source_host_id", sa.Integer, nullable=False),
        sa.Column("nessus_hostname", sa.String(255), nullable=True),
        sa.Column("nessus_ip", sa.String(50), nullable=True),
        sa.Column("first_seen", sa.DateTime, nullable=False),
        sa.Column("last_seen", sa.DateTime, nullable=False),
    )

    op.create_index("ix_vulnerabilities_asset_id", "vulnerabilities", ["asset_id"])
    op.create_index("ix_vulnerabilities_plugin_id", "vulnerabilities", ["plugin_id"])
    op.create_index("ix_vulnerabilities_cve_id", "vulnerabilities", ["cve_id"])
    op.create_index("ix_vulnerabilities_source_scan_id", "vulnerabilities", ["source_scan_id"])


def downgrade() -> None:
    op.drop_table("vulnerabilities")
    op.drop_table("nessus_sync_logs")
