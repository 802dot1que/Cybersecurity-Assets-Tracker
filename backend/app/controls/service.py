"""Security-control helpers: applicability checks, status updates, coverage."""
from __future__ import annotations
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.assets.models import Asset, AssetSecurityControl, ControlType


def applicable_controls(db: Session, asset_type: str) -> list[ControlType]:
    """Filter control_types by their applies_to_asset_types whitelist.
    Empty whitelist = applies to all asset types."""
    out: list[ControlType] = []
    for ct in db.scalars(select(ControlType).where(ControlType.is_active == True)).all():  # noqa: E712
        allowed = ct.applies_to_asset_types or []
        if not allowed or asset_type in allowed:
            out.append(ct)
    return out


def upsert_control(
    db: Session,
    *,
    asset: Asset,
    control_code: str,
    system_status: str | None = None,
    override_status: str | None = None,
    last_check_in: datetime | None = None,
    source: str | None = None,
    user_id: int | None = None,
) -> AssetSecurityControl:
    ct = db.scalar(select(ControlType).where(ControlType.code == control_code))
    if ct is None:
        raise ValueError(f"Unknown control code: {control_code}")
    db.flush()
    link = next(
        (l for l in asset.controls if l.control_type_id == ct.id),
        None,
    )
    if link is None:
        link = AssetSecurityControl(control_type_id=ct.id)
        link.asset = asset
    if system_status is not None:
        link.system_status = system_status
    if override_status is not None:
        link.override_status = override_status
        link.override_by = user_id
        link.override_at = datetime.now(timezone.utc)
    if last_check_in is not None:
        link.last_check_in = last_check_in
    if source is not None:
        link.source = source
    return link
