"""Asset read helpers — build rich `AssetOut` with effective values, controls, criticality."""
from __future__ import annotations
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.assets.constants import control_applies
from app.assets.models import Asset, AssetSecurityControl, ControlType
from app.assets.schemas import (
    AssetIPOut, AssetListItem, AssetOut, ConflictOut, ControlOut, CriticalityOut, FieldValue,
)


def _field(asset: Asset, name: str) -> FieldValue:
    system = getattr(asset, f"system_{name}")
    override = getattr(asset, f"override_{name}")
    effective = override if override not in (None, "") else system
    meta = (asset.override_meta or {}).get(name) or {}
    return FieldValue(
        system=system, override=override, effective=effective,
        overridden=override not in (None, ""),
        overridden_by=meta.get("by"),
        overridden_at=meta.get("at"),
    )


def to_asset_out(db: Session, asset: Asset) -> AssetOut:
    atype = asset.effective("asset_type") or "Unknown"
    # controls — include all active control types, mark applicability
    all_controls = db.scalars(select(ControlType).where(ControlType.is_active == True)).all()  # noqa: E712
    link_by_type = {l.control_type_id: l for l in asset.controls}
    controls_out: list[ControlOut] = []
    for ct in all_controls:
        applies = (
            control_applies(ct.code, atype)
            if not ct.applies_to_asset_types
            else atype in ct.applies_to_asset_types
        )
        link = link_by_type.get(ct.id)
        controls_out.append(ControlOut(
            code=ct.code, name=ct.name, applicable=applies,
            system_status=link.system_status if link else None,
            override_status=link.override_status if link else None,
            effective_status=link.effective_status if link else "Unknown",
            last_check_in=link.last_check_in if link else None,
            source=link.source if link else None,
        ))

    open_conflicts = [c for c in asset.conflicts if not c.resolved]
    conflict_count = len(open_conflicts)
    conflicts_out = [
        ConflictOut(
            id=c.id, field=c.field,
            value_a=c.value_a, value_b=c.value_b,
            source_a=c.source_a, source_b=c.source_b,
            created_at=c.created_at,
        )
        for c in open_conflicts
    ]

    return AssetOut(
        id=asset.id,
        uuid=asset.uuid,
        hostname=_field(asset, "hostname"),
        mac=_field(asset, "mac"),
        asset_type=_field(asset, "asset_type"),
        os=_field(asset, "os"),
        os_version=_field(asset, "os_version"),
        os_eos=_field(asset, "os_eos"),
        ips=[AssetIPOut(ip=i.ip, source=i.source, first_seen=i.first_seen, last_seen=i.last_seen)
             for i in asset.ips],
        first_seen=asset.first_seen,
        last_seen=asset.last_seen,
        confidence_score=asset.confidence_score or 0.0,
        controls=controls_out,
        criticality=(
            CriticalityOut(
                level=asset.criticality.level, score=asset.criticality.score,
                source=asset.criticality.source, details=asset.criticality.details or {},
            ) if asset.criticality else None
        ),
        conflict_count=conflict_count,
        conflicts=conflicts_out,
    )


def to_list_item(db: Session, asset: Asset) -> AssetListItem:
    conflict_count = sum(1 for c in asset.conflicts if not c.resolved)
    return AssetListItem(
        id=asset.id, uuid=asset.uuid,
        hostname=asset.effective("hostname"),
        mac=asset.effective("mac"),
        asset_type=asset.effective("asset_type"),
        os=asset.effective("os"),
        os_version=asset.effective("os_version"),
        os_eos=asset.effective("os_eos"),
        ips=[i.ip for i in asset.ips],
        last_seen=asset.last_seen,
        criticality_level=asset.criticality.level if asset.criticality else None,
        confidence_score=asset.confidence_score or 0.0,
        conflict_count=conflict_count,
    )
