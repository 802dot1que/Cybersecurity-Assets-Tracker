from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.models import AuditLog
from app.auth.models import User
from app.core.db import get_db
from app.core.deps import get_current_user

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
def list_audit(
    entity_type: str | None = None,
    entity_id: int | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    rows = db.scalars(stmt.limit(limit)).all()
    return [
        {
            "id": r.id, "entity_type": r.entity_type, "entity_id": r.entity_id,
            "action": r.action, "field": r.field,
            "old_value": r.old_value, "new_value": r.new_value,
            "user_id": r.user_id, "created_at": r.created_at,
            "extra": r.extra,
        }
        for r in rows
    ]
