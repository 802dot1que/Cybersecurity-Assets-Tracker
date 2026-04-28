from datetime import datetime
from sqlalchemy import (
    Integer, String, Float, Text, DateTime, ForeignKey, Boolean, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.db import Base


class Vulnerability(Base):
    __tablename__ = "vulnerabilities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    asset_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("assets.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Nessus identifiers
    plugin_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    plugin_name: Mapped[str] = mapped_column(String(500), nullable=False)
    plugin_family: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Severity
    severity: Mapped[str] = mapped_column(String(20), nullable=False)   # info/low/medium/high/critical
    severity_id: Mapped[int] = mapped_column(Integer, nullable=False)   # 0-4
    cvss_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    cvss_v3_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # CVE / references
    cve_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    # Details
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    solution: Mapped[str | None] = mapped_column(Text, nullable=True)
    see_also: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Network context
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    protocol: Mapped[str | None] = mapped_column(String(10), nullable=True)
    service: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Nessus source tracking
    source_scan_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    source_host_id: Mapped[int] = mapped_column(Integer, nullable=False)
    nessus_hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nessus_ip: Mapped[str | None] = mapped_column(String(50), nullable=True)

    first_seen: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=func.now())
    last_seen: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=func.now())

    asset: Mapped[object] = relationship("Asset", foreign_keys=[asset_id])


class NessusSyncLog(Base):
    __tablename__ = "nessus_sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    scan_id: Mapped[int | None] = mapped_column(Integer, nullable=True)   # None = full sync
    scans_processed: Mapped[int] = mapped_column(Integer, default=0)
    assets_matched: Mapped[int] = mapped_column(Integer, default=0)
    vulns_created: Mapped[int] = mapped_column(Integer, default=0)
    vulns_updated: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
