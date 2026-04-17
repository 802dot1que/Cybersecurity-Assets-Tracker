"""Core asset models.

Design: every user-editable field uses the override pattern.
    system_<field>           -> last value written by ingestion/system
    override_<field>         -> nullable; set by user
    override_<field>_by      -> user id who set it
    override_<field>_at      -> timestamp

Effective value = override_<field> if not null else system_<field>.
This is handled by the `Asset.effective()` helper and the serializer.
"""
from datetime import date, datetime
from sqlalchemy import (
    Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


# ---- Assets ----------------------------------------------------------------

class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Immutable surrogate key — stable across merges
    uuid: Mapped[str] = mapped_column(String(36), unique=True, index=True)

    # Overridable fields (system + override)
    system_hostname:    Mapped[str | None] = mapped_column(String(255), index=True)
    override_hostname:  Mapped[str | None] = mapped_column(String(255))

    system_mac:         Mapped[str | None] = mapped_column(String(17), index=True, unique=False)
    override_mac:       Mapped[str | None] = mapped_column(String(17))

    system_asset_type:   Mapped[str | None] = mapped_column(String(40), index=True)
    override_asset_type: Mapped[str | None] = mapped_column(String(40))

    system_os:           Mapped[str | None] = mapped_column(String(120))
    override_os:         Mapped[str | None] = mapped_column(String(120))

    system_os_version:   Mapped[str | None] = mapped_column(String(60))
    override_os_version: Mapped[str | None] = mapped_column(String(60))

    system_os_eos:       Mapped[date | None] = mapped_column(Date)
    override_os_eos:     Mapped[date | None] = mapped_column(Date)

    # Timestamps
    first_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    confidence_score: Mapped[float] = mapped_column(Float, default=0.0)  # 0..1

    # Per-field override metadata stored as JSONB to avoid a wide table.
    # shape: { "hostname": {"by": 3, "at": "2026-04-16T..."}, ... }
    override_meta: Mapped[dict] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    ips:        Mapped[list["AssetIP"]] = relationship(back_populates="asset", cascade="all, delete-orphan")
    controls:   Mapped[list["AssetSecurityControl"]] = relationship(
        back_populates="asset", cascade="all, delete-orphan"
    )
    conflicts:  Mapped[list["AssetConflict"]] = relationship(
        back_populates="asset", cascade="all, delete-orphan"
    )
    criticality: Mapped["AssetCriticality | None"] = relationship(
        back_populates="asset", uselist=False, cascade="all, delete-orphan"
    )

    # ---------- effective value helper ----------
    OVERRIDABLE_FIELDS = ("hostname", "mac", "asset_type", "os", "os_version", "os_eos")

    def effective(self, field: str):
        """Returns override if set, else system."""
        ov = getattr(self, f"override_{field}", None)
        return ov if ov not in (None, "") else getattr(self, f"system_{field}", None)


class AssetIP(Base):
    __tablename__ = "asset_ips"
    __table_args__ = (UniqueConstraint("asset_id", "ip", name="uq_asset_ip"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    ip: Mapped[str] = mapped_column(String(15), index=True)  # IPv4 only
    is_override: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str | None] = mapped_column(String(60))
    first_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    asset: Mapped["Asset"] = relationship(back_populates="ips")


# ---- Security Controls -----------------------------------------------------

class ControlType(Base):
    """Catalog of security controls. Add new rows to add new controls."""
    __tablename__ = "control_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)  # EDR, AV, ...
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(Text)
    # Which asset types this control applies to. Empty = applies to all.
    applies_to_asset_types: Mapped[list[str]] = mapped_column(JSONB, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AssetSecurityControl(Base):
    __tablename__ = "asset_security_controls"
    __table_args__ = (UniqueConstraint("asset_id", "control_type_id", name="uq_asset_control"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    control_type_id: Mapped[int] = mapped_column(ForeignKey("control_types.id", ondelete="RESTRICT"))

    system_status:   Mapped[str | None] = mapped_column(String(20))  # Installed | Missing | Unknown
    override_status: Mapped[str | None] = mapped_column(String(20))

    last_check_in: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[str | None] = mapped_column(String(60))
    attrs: Mapped[dict] = mapped_column(JSONB, default=dict)

    override_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    override_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    asset: Mapped["Asset"] = relationship(back_populates="controls")
    control_type: Mapped["ControlType"] = relationship()

    @property
    def effective_status(self) -> str:
        return self.override_status or self.system_status or "Unknown"


# ---- Criticality -----------------------------------------------------------

class AssetCriticality(Base):
    __tablename__ = "asset_criticality"

    asset_id: Mapped[int] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), primary_key=True
    )
    level: Mapped[str] = mapped_column(String(10))  # Low/Medium/High/Critical
    score: Mapped[int] = mapped_column(Integer)     # 0..100
    source: Mapped[str] = mapped_column(String(20), default="calculated")  # manual | calculated | questionnaire
    details: Mapped[dict] = mapped_column(JSONB, default=dict)  # future: questionnaire answers
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    asset: Mapped["Asset"] = relationship(back_populates="criticality")


# ---- Conflicts -------------------------------------------------------------

class AssetConflict(Base):
    """Surfaces conflicting values from different sources for an asset field."""
    __tablename__ = "asset_conflicts"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    field: Mapped[str] = mapped_column(String(40))
    value_a: Mapped[str | None] = mapped_column(Text)
    value_b: Mapped[str | None] = mapped_column(Text)
    source_a: Mapped[str | None] = mapped_column(String(60))
    source_b: Mapped[str | None] = mapped_column(String(60))
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    asset: Mapped["Asset"] = relationship(back_populates="conflicts")
