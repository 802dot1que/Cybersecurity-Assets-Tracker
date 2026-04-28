from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class IngestionBatch(Base):
    __tablename__ = "ingestion_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(String(60))   # e.g. "excel", "ndr", "edr-api"
    status: Mapped[str] = mapped_column(String(20), default="pending")
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    created_count: Mapped[int] = mapped_column(Integer, default=0)
    merged_count: Mapped[int] = mapped_column(Integer, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    mapping: Mapped[dict] = mapped_column(JSONB, default=dict)
    error_log: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    records: Mapped[list["IngestionRecord"]] = relationship(
        back_populates="batch", cascade="all, delete-orphan"
    )


class IngestionRecord(Base):
    __tablename__ = "ingestion_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("ingestion_batches.id", ondelete="CASCADE"), index=True)
    row_index: Mapped[int] = mapped_column(Integer)
    raw: Mapped[dict] = mapped_column(JSONB)
    normalized: Mapped[dict | None] = mapped_column(JSONB)
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"))
    action: Mapped[str | None] = mapped_column(String(20))   # created | merged | skipped | error
    match_confidence: Mapped[float | None] = mapped_column()
    error: Mapped[str | None] = mapped_column(Text)

    batch: Mapped["IngestionBatch"] = relationship(back_populates="records")


class ColumnMapping(Base):
    """Saved per-source column mapping profile so users don't re-map each upload."""
    __tablename__ = "column_mappings"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    source: Mapped[str] = mapped_column(String(60))
    mapping: Mapped[dict] = mapped_column(JSONB)  # {"hostname": "Device Name", "ip": "IPv4", ...}
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
