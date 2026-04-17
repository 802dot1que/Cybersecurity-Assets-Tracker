from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, delete as sqla_delete, exists, func, or_, select
from sqlalchemy.orm import Session

from app.assets.constants import control_applies
from app.assets.models import Asset, AssetConflict, AssetIP, AssetSecurityControl, ControlType
from app.assets.schemas import (
    AssetListItem, AssetOut, AssetPage, BulkDeletePayload, ConflictOut,
    ControlUpdatePayload, CreateAssetPayload, ManualCriticalityPayload, OverridePayload,
)
from app.assets.service import to_asset_out, to_list_item
from app.auth.models import User
from app.controls.service import upsert_control
from app.core.db import get_db
from app.core.deps import get_current_user
from app.criticality.service import recompute as recompute_crit, set_manual as set_manual_crit
from app.overrides.service import set_override

router = APIRouter(prefix="/api/assets", tags=["assets"])

_CRIT_ORDER = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}


class ConflictResolvePayload(BaseModel):
    choice: str  # "a" | "b" | "override"
    override_value: str | None = None


@router.get("", response_model=AssetPage)
def list_assets(
    q: str | None = Query(None, description="Search hostname/IP/MAC"),
    asset_type: str | None = None,
    asset_status: str | None = None,
    environment: str | None = None,
    missing_control: str | None = Query(None, description="Control code — assets where applicable but not Installed"),
    installed_control: str | None = Query(None, description="Control code — assets where this control is Installed"),
    has_conflicts: bool = False,
    eos_only: bool = False,
    unknown_only: bool = False,
    sort_by: str | None = None,
    sort_dir: str = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> AssetPage:
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
    if asset_status:
        stmt = stmt.where(or_(
            Asset.system_asset_status == asset_status,
            Asset.override_asset_status == asset_status,
        ))
    if environment:
        stmt = stmt.where(or_(
            Asset.system_environment == environment,
            Asset.override_environment == environment,
        ))
    if eos_only:
        from datetime import date
        stmt = stmt.where(func.coalesce(Asset.override_os_eos, Asset.system_os_eos) <= date.today())
    if unknown_only:
        stmt = stmt.where(or_(
            func.coalesce(Asset.override_asset_type, Asset.system_asset_type) == "Unknown",
            and_(Asset.system_asset_type.is_(None), Asset.override_asset_type.is_(None)),
        ))
    if has_conflicts:
        stmt = stmt.where(
            exists().where(
                and_(AssetConflict.asset_id == Asset.id, AssetConflict.resolved == False)  # noqa: E712
            )
        )
    assets = list(db.scalars(stmt).all())

    # Python-side control filters
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

    if installed_control:
        ct = db.scalar(select(ControlType).where(ControlType.code == installed_control))

        def is_installed(a: Asset) -> bool:
            link = next((l for l in a.controls if l.control_type_id == (ct.id if ct else -1)), None)
            return (link.effective_status if link else "Unknown") == "Installed"

        assets = [a for a in assets if is_installed(a)]

    # Sorting
    if sort_by:
        reverse = sort_dir.lower() == "desc"
        str_fields = ("hostname", "mac", "asset_type", "os", "os_version", "asset_status", "environment", "location")
        if sort_by in str_fields:
            assets.sort(key=lambda a: (a.effective(sort_by) or "").lower(), reverse=reverse)
        elif sort_by == "last_seen":
            _epoch = datetime(2000, 1, 1, tzinfo=timezone.utc)
            assets.sort(key=lambda a: a.last_seen or _epoch, reverse=reverse)
        elif sort_by == "confidence":
            assets.sort(key=lambda a: a.confidence_score or 0.0, reverse=reverse)
        elif sort_by == "criticality":
            assets.sort(
                key=lambda a: _CRIT_ORDER.get(a.criticality.level if a.criticality else None, 0),
                reverse=reverse,
            )
        elif sort_by == "conflicts":
            assets.sort(
                key=lambda a: sum(1 for c in a.conflicts if not c.resolved),
                reverse=reverse,
            )

    total = len(assets)
    total_pages = max(1, (total + page_size - 1) // page_size)
    offset = (page - 1) * page_size
    page_assets = assets[offset: offset + page_size]

    return AssetPage(
        items=[to_list_item(db, a) for a in page_assets],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=AssetOut, status_code=201)
def create_asset(
    payload: CreateAssetPayload,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    import uuid as uuidlib
    from app.audit.service import record as audit

    now = datetime.now(timezone.utc)
    asset = Asset(
        uuid=str(uuidlib.uuid4()),
        system_hostname=payload.hostname or None,
        system_mac=payload.mac or None,
        system_asset_type=payload.asset_type or None,
        system_os=payload.os or None,
        system_os_version=payload.os_version or None,
        system_asset_status=payload.asset_status or None,
        system_environment=payload.environment or None,
        system_location=payload.location or None,
        first_seen=now,
        last_seen=now,
        confidence_score=1.0,
        override_meta={},
    )
    db.add(asset)
    db.flush()
    for ip in payload.ips:
        ip = ip.strip()
        if ip:
            asset.ips.append(AssetIP(ip=ip, source="manual", first_seen=now, last_seen=now))
    recompute_crit(db, asset)
    audit(db, entity_type="asset", entity_id=asset.id, action="create_manual",
          user_id=current.id, extra={"source": "manual"})
    db.commit()
    db.refresh(asset)
    return to_asset_out(db, asset)


@router.post("/bulk-delete", status_code=204)
def bulk_delete_assets(
    payload: BulkDeletePayload,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    from app.audit.service import record as audit
    if not payload.ids:
        return
    db.execute(sqla_delete(Asset).where(Asset.id.in_(payload.ids)))
    audit(db, entity_type="asset", entity_id=0, action="bulk_delete",
          user_id=current.id, extra={"ids": payload.ids, "count": len(payload.ids)})
    db.commit()


@router.get("/{asset_id}", response_model=AssetOut)
def get_asset(asset_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Not found")
    return to_asset_out(db, asset)


@router.delete("/{asset_id}", status_code=204)
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    from app.audit.service import record as audit
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Not found")
    db.delete(asset)
    audit(db, entity_type="asset", entity_id=asset_id, action="delete",
          user_id=current.id, extra={})
    db.commit()


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


@router.get("/{asset_id}/conflicts", response_model=list[ConflictOut])
def list_conflicts(
    asset_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user),
):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Not found")
    rows = db.scalars(
        select(AssetConflict).where(
            AssetConflict.asset_id == asset_id,
            AssetConflict.resolved == False,  # noqa: E712
        ).order_by(AssetConflict.created_at.desc())
    ).all()
    return [
        ConflictOut(
            id=r.id, field=r.field,
            value_a=r.value_a, value_b=r.value_b,
            source_a=r.source_a, source_b=r.source_b,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/{asset_id}/conflicts/{conflict_id}/resolve", response_model=AssetOut)
def resolve_conflict(
    asset_id: int, conflict_id: int, payload: ConflictResolvePayload,
    db: Session = Depends(get_db), current: User = Depends(get_current_user),
):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Not found")
    conflict = db.get(AssetConflict, conflict_id)
    if not conflict or conflict.asset_id != asset_id:
        raise HTTPException(404, "Conflict not found")
    if conflict.resolved:
        raise HTTPException(400, "Already resolved")

    if payload.choice == "a":
        chosen = conflict.value_a
    elif payload.choice == "b":
        chosen = conflict.value_b
    elif payload.choice == "override":
        chosen = payload.override_value
    else:
        raise HTTPException(422, "choice must be 'a', 'b', or 'override'")

    if conflict.field in Asset.OVERRIDABLE_FIELDS:
        set_override(db, asset, conflict.field, chosen, user_id=current.id)

    conflict.resolved = True
    recompute_crit(db, asset)
    db.commit()
    db.refresh(asset)
    return to_asset_out(db, asset)
