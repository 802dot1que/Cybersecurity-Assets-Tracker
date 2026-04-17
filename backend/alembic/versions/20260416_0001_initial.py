"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("full_name", sa.String(120), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="analyst"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "assets",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("uuid", sa.String(36), unique=True, index=True, nullable=False),
        sa.Column("system_hostname", sa.String(255), index=True),
        sa.Column("override_hostname", sa.String(255)),
        sa.Column("system_mac", sa.String(17), index=True),
        sa.Column("override_mac", sa.String(17)),
        sa.Column("system_asset_type", sa.String(40), index=True),
        sa.Column("override_asset_type", sa.String(40)),
        sa.Column("system_os", sa.String(120)),
        sa.Column("override_os", sa.String(120)),
        sa.Column("system_os_version", sa.String(60)),
        sa.Column("override_os_version", sa.String(60)),
        sa.Column("system_os_eos", sa.Date),
        sa.Column("override_os_eos", sa.Date),
        sa.Column("first_seen", sa.DateTime(timezone=True)),
        sa.Column("last_seen", sa.DateTime(timezone=True)),
        sa.Column("confidence_score", sa.Float, server_default="0"),
        sa.Column("override_meta", postgresql.JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "asset_ips",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("asset_id", sa.Integer, sa.ForeignKey("assets.id", ondelete="CASCADE"), index=True),
        sa.Column("ip", sa.String(15), index=True, nullable=False),
        sa.Column("is_override", sa.Boolean, server_default=sa.text("false")),
        sa.Column("source", sa.String(60)),
        sa.Column("first_seen", sa.DateTime(timezone=True)),
        sa.Column("last_seen", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("asset_id", "ip", name="uq_asset_ip"),
    )

    op.create_table(
        "control_types",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("code", sa.String(30), unique=True, nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("applies_to_asset_types", postgresql.JSONB, server_default="[]"),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
    )

    op.create_table(
        "asset_security_controls",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("asset_id", sa.Integer, sa.ForeignKey("assets.id", ondelete="CASCADE"), index=True),
        sa.Column("control_type_id", sa.Integer, sa.ForeignKey("control_types.id", ondelete="RESTRICT")),
        sa.Column("system_status", sa.String(20)),
        sa.Column("override_status", sa.String(20)),
        sa.Column("last_check_in", sa.DateTime(timezone=True)),
        sa.Column("source", sa.String(60)),
        sa.Column("attrs", postgresql.JSONB, server_default="{}"),
        sa.Column("override_by", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("override_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("asset_id", "control_type_id", name="uq_asset_control"),
    )

    op.create_table(
        "asset_criticality",
        sa.Column("asset_id", sa.Integer, sa.ForeignKey("assets.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("level", sa.String(10), nullable=False),
        sa.Column("score", sa.Integer, nullable=False),
        sa.Column("source", sa.String(20), server_default="calculated"),
        sa.Column("details", postgresql.JSONB, server_default="{}"),
        sa.Column("updated_by", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "asset_conflicts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("asset_id", sa.Integer, sa.ForeignKey("assets.id", ondelete="CASCADE"), index=True),
        sa.Column("field", sa.String(40), nullable=False),
        sa.Column("value_a", sa.Text),
        sa.Column("value_b", sa.Text),
        sa.Column("source_a", sa.String(60)),
        sa.Column("source_b", sa.String(60)),
        sa.Column("resolved", sa.Boolean, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "ingestion_batches",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("source", sa.String(60), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("row_count", sa.Integer, server_default="0"),
        sa.Column("created_count", sa.Integer, server_default="0"),
        sa.Column("merged_count", sa.Integer, server_default="0"),
        sa.Column("error_count", sa.Integer, server_default="0"),
        sa.Column("mapping", postgresql.JSONB, server_default="{}"),
        sa.Column("error_log", sa.Text),
        sa.Column("uploaded_by", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "ingestion_records",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("batch_id", sa.Integer, sa.ForeignKey("ingestion_batches.id", ondelete="CASCADE"), index=True),
        sa.Column("row_index", sa.Integer, nullable=False),
        sa.Column("raw", postgresql.JSONB, nullable=False),
        sa.Column("normalized", postgresql.JSONB),
        sa.Column("asset_id", sa.Integer, sa.ForeignKey("assets.id")),
        sa.Column("action", sa.String(20)),
        sa.Column("match_confidence", sa.Float),
        sa.Column("error", sa.Text),
    )

    op.create_table(
        "column_mappings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(120), unique=True, nullable=False),
        sa.Column("source", sa.String(60), nullable=False),
        sa.Column("mapping", postgresql.JSONB, nullable=False),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("entity_type", sa.String(40), index=True, nullable=False),
        sa.Column("entity_id", sa.Integer, index=True, nullable=False),
        sa.Column("field", sa.String(60)),
        sa.Column("old_value", sa.Text),
        sa.Column("new_value", sa.Text),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("extra", postgresql.JSONB, server_default="{}"),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    for t in [
        "audit_log", "column_mappings", "ingestion_records", "ingestion_batches",
        "asset_conflicts", "asset_criticality", "asset_security_controls",
        "control_types", "asset_ips", "assets", "users",
    ]:
        op.drop_table(t)
