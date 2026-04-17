"""Override service — the single gateway for user-initiated asset field changes.

Writes override_<field>, updates override_meta, and records an audit log row.
Always preserves the underlying system_<field> value (provenance).
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.assets.models import Asset
from app.audit.service import record as audit


def set_override(
    db: Session, asset: Asset, field: str, new_value: Any, *, user_id: int
) -> Asset:
    if field not in Asset.OVERRIDABLE_FIELDS:
        raise HTTPException(400, f"Field '{field}' is not overridable")
    old_effective = asset.effective(field)
    setattr(asset, f"override_{field}", new_value)

    meta = dict(asset.override_meta or {})
    if new_value in (None, ""):
        meta.pop(field, None)
    else:
        meta[field] = {"by": user_id, "at": datetime.now(timezone.utc).isoformat()}
    asset.override_meta = meta

    audit(
        db, entity_type="asset", entity_id=asset.id,
        action="override" if new_value not in (None, "") else "clear",
        field=field, old_value=old_effective, new_value=new_value, user_id=user_id,
    )
    return asset


def clear_override(db: Session, asset: Asset, field: str, *, user_id: int) -> Asset:
    return set_override(db, asset, field, None, user_id=user_id)
