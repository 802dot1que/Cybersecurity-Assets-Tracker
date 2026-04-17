from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AuditLog(Base):
    """Polymorphic audit log; scoped primarily to assets today but generalizable."""
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(40), index=True)   # "asset" | "control" | ...
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    field: Mapped[str | None] = mapped_column(String(60))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    action: Mapped[str] = mapped_column(String(20))   # override | clear | merge | ingest
    extra: Mapped[dict] = mapped_column(JSONB, default=dict)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
