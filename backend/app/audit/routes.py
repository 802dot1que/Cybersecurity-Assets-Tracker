from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
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
    q: str | None = Query(None, description="Text search across field, values, action"),
    action: str | None = Query(None, description="Filter by action type"),
    field: str | None = Query(None, description="Filter by field name"),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if field:
        stmt = stmt.where(AuditLog.field == field)
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= date_from)
    if date_to:
        stmt = stmt.where(AuditLog.created_at <= date_to)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            AuditLog.action.ilike(like),
            AuditLog.field.ilike(like),
            AuditLog.old_value.ilike(like),
            AuditLog.new_value.ilike(like),
        ))

    rows = db.scalars(stmt.limit(limit)).all()

    # Batch-load users
    user_ids = {r.user_id for r in rows if r.user_id}
    users: dict = {}
    if user_ids:
        users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(user_ids))).all()}

    # Batch-load asset hostnames for asset-type entries
    from app.assets.models import Asset
    asset_ids = {r.entity_id for r in rows if r.entity_type == "asset" and r.entity_id}
    assets: dict = {}
    if asset_ids:
        assets = {a.id: a for a in db.scalars(select(Asset).where(Asset.id.in_(asset_ids))).all()}

    result = []
    for r in rows:
        user = users.get(r.user_id) if r.user_id else None
        asset = assets.get(r.entity_id) if r.entity_type == "asset" else None
        result.append({
            "id": r.id,
            "entity_type": r.entity_type,
            "entity_id": r.entity_id,
            "action": r.action,
            "field": r.field,
            "old_value": r.old_value,
            "new_value": r.new_value,
            "user_id": r.user_id,
            "user_name": user.full_name if user else None,
            "user_email": user.email if user else None,
            "created_at": r.created_at,
            "extra": r.extra,
            "asset_hostname": asset.effective("hostname") if asset else None,
            "document_name": (r.extra or {}).get("filename"),
        })
    return result
