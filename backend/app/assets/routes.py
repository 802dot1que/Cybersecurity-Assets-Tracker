from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.assets.constants import control_applies
from app.assets.models import Asset, AssetIP, AssetSecurityControl, ControlType
from app.assets.schemas import (
    AssetListItem, AssetOut, ControlUpdatePayload, ManualCriticalityPayload, OverridePayload,
)
from app.assets.service import to_asset_out, to_list_item
from app.auth.models import User
from app.controls.service import upsert_control
from app.core.db import get_db
from app.core.deps import get_current_user
from app.criticality.service import recompute as recompute_crit, set_manual as set_manual_crit
from app.overrides.service import set_override

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("", response_model=list[AssetListItem])
def list_assets(
    q: str | None = Query(None, description="Search hostname/IP/MAC"),
    asset_type: str | None = None,
    missing_control: str | None = Query(None, description="Control code (e.g. EDR) — return assets where this control is applicable but not Installed"),
    eos_only: bool = False,
    unknown_only: bool = False,
    limit: int = 200,
    offset: int = 0,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Asset)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.outerjoin(AssetIP).where(or_(
            Asset.system_hostname.ilike(like),
            Asset.override_hostname.ilike(like),
            Asset.system_mac.ilike(like),
            AssetIP.ip.ilike(like),
        )).distinct()
    if asset_type:
        stmt = stmt.where(or_(
            Asset.system_asset_type == asset_type,
            Asset.override_asset_type == asset_type,
        ))
    if eos_only:
        from datetime import date
        stmt = stmt.where(func.coalesce(Asset.override_os_eos, Asset.system_os_eos) <= date.today())
    if unknown_only:
        stmt = stmt.where(or_(
            func.coalesce(Asset.override_asset_type, Asset.system_asset_type) == "Unknown",
            and_(Asset.system_asset_type.is_(None), Asset.override_asset_type.is_(None)),
        ))
    assets = db.scalars(stmt.limit(limit).offset(offset)).all()

    if missing_control:
        ct = db.scalar(select(ControlType).where(ControlType.code == missing_control))
        whitelist = (ct.applies_to_asset_types or []) if ct else []

        def is_missing(a: Asset) -> bool:
            atype = a.effective("asset_type") or "Unknown"
            applicable = (atype in whitelist) if whitelist else control_applies(missing_control, atype)
            if not applicable:
                return False
            link = next((l for l in a.controls if l.control_type_id == (ct.id if ct else -1)), None)
            return (link.effective_status if link else "Unknown") != "Installed"

        assets = [a for a in assets if is_missing(a)]

    return [to_list_item(a) for a in assets]


@router.get("/{asset_id}", response_model=AssetOut)
def get_asset(asset_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Not found")
    return to_asset_out(db, asset)


@router.put("/{asset_id}/override/{field}", response_model=AssetOut)
def override_field(
    asset_id: int, field: str, payload: OverridePayload,
    db: Session = Depends(get_db), current: User = Depends(get_current_user),
):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Not found")
    set_override(db, asset, field, payload.value, user_id=current.id)
    recompute_crit(db, asset)
    db.commit()
    db.refresh(asset)
    return to_asset_out(db, asset)


@router.delete("/{asset_id}/override/{field}", response_model=AssetOut)
def clear_override(
    asset_id: int, field: str,
    db: Session = Depends(get_db), current: User = Depends(get_current_user),
):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Not found")
    set_override(db, asset, field, None, user_id=current.id)
    recompute_crit(db, asset)
    db.commit()
    db.refresh(asset)
    return to_asset_out(db, asset)


@router.put("/{asset_id}/controls/{control_code}", response_model=AssetOut)
def update_control(
    asset_id: int, control_code: str, payload: ControlUpdatePayload,
    db: Session = Depends(get_db), current: User = Depends(get_current_user),
):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Not found")
    upsert_control(
        db, asset=asset, control_code=control_code,
        override_status=payload.override_status,
        last_check_in=payload.last_check_in, source=payload.source,
        user_id=current.id,
    )
    recompute_crit(db, asset)
    db.commit()
    db.refresh(asset)
    return to_asset_out(db, asset)


@router.put("/{asset_id}/criticality", response_model=AssetOut)
def set_criticality(
    asset_id: int, payload: ManualCriticalityPayload,
    db: Session = Depends(get_db), current: User = Depends(get_current_user),
):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Not found")
    set_manual_crit(db, asset, level=payload.level, score=payload.score, user_id=current.id)
    db.commit()
    db.refresh(asset)
    return to_asset_out(db, asset)


@router.post("/{asset_id}/criticality/recompute", response_model=AssetOut)
def recompute_criticality(
    asset_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user),
):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Not found")
    recompute_crit(db, asset)
    db.commit()
    db.refresh(asset)
    return to_asset_out(db, asset)
