"""Dashboard aggregations + Excel export."""
from __future__ import annotations
from datetime import date
from io import BytesIO
from typing import Any

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.assets.constants import control_applies
from app.assets.models import Asset, AssetConflict, AssetSecurityControl, ControlType


def dashboard_summary(db: Session) -> dict[str, Any]:
    total = db.scalar(select(func.count()).select_from(Asset)) or 0

    # Assets with EOS OS (past today).
    today = date.today()
    eos_count = db.scalar(
        select(func.count()).select_from(Asset).where(
            func.coalesce(Asset.override_os_eos, Asset.system_os_eos) <= today
        )
    ) or 0

    # Coverage per control (applicable denominator only).
    control_types = db.scalars(select(ControlType).where(ControlType.is_active == True)).all()  # noqa: E712
    assets = db.scalars(select(Asset)).all()

    coverage = []
    for ct in control_types:
        applicable_assets = []
        for a in assets:
            atype = a.effective("asset_type") or "Unknown"
            apply = (
                atype in ct.applies_to_asset_types
                if ct.applies_to_asset_types
                else control_applies(ct.code, atype)
            )
            if apply:
                applicable_assets.append(a)

        applicable_ids = {a.id for a in applicable_assets}
        installed = 0
        for link in db.scalars(
            select(AssetSecurityControl).where(AssetSecurityControl.control_type_id == ct.id)
        ).all():
            if link.asset_id in applicable_ids and link.effective_status == "Installed":
                installed += 1

        denom = len(applicable_ids)
        coverage.append({
            "code": ct.code,
            "name": ct.name,
            "applicable": denom,
            "installed": installed,
            "missing": denom - installed,
            "coverage_pct": round(100 * installed / denom, 1) if denom else None,
        })

    # Unknown-type assets (likely unmanaged).
    unknown = db.scalar(
        select(func.count()).select_from(Asset).where(
            func.coalesce(Asset.override_asset_type, Asset.system_asset_type).in_(["Unknown", None])
        )
    ) or 0

    # Criticality distribution
    crit_rows = db.execute(
        select(Asset).join(Asset.criticality, isouter=True)
    ).scalars().all()
    crit_dist = {"Low": 0, "Medium": 0, "High": 0, "Critical": 0, "Unscored": 0}
    for a in crit_rows:
        lvl = a.criticality.level if a.criticality else None
        crit_dist[lvl or "Unscored"] = crit_dist.get(lvl or "Unscored", 0) + 1

    conflicts_count = db.scalar(
        select(func.count()).select_from(AssetConflict).where(AssetConflict.resolved == False)  # noqa: E712
    ) or 0

    return {
        "total_assets": total,
        "eos_assets": eos_count,
        "unknown_assets": unknown,
        "conflicts_count": conflicts_count,
        "coverage": coverage,
        "criticality_distribution": crit_dist,
    }


def export_assets_excel(db: Session) -> bytes:
    assets = db.scalars(select(Asset)).all()
    rows = []
    for a in assets:
        row = {
            "ID": a.id,
            "UUID": a.uuid,
            "Hostname": a.effective("hostname"),
            "MAC": a.effective("mac"),
            "IPs": ", ".join(i.ip for i in a.ips),
            "Asset Type": a.effective("asset_type"),
            "OS": a.effective("os"),
            "OS Version": a.effective("os_version"),
            "OS EOS": a.effective("os_eos"),
            "First Seen": a.first_seen,
            "Last Seen": a.last_seen,
            "Confidence": a.confidence_score,
            "Criticality": a.criticality.level if a.criticality else None,
            "Criticality Score": a.criticality.score if a.criticality else None,
        }
        for link in a.controls:
            row[f"Ctrl:{link.control_type.code}"] = link.effective_status
        rows.append(row)

    buf = BytesIO()
    df = pd.DataFrame(rows)
    with pd.ExcelWriter(buf, engine="xlsxwriter") as writer:
        df.to_excel(writer, sheet_name="Assets", index=False)
    return buf.getvalue()
