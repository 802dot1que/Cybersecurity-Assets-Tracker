"""Dashboard aggregations + Excel/CSV export with filters."""
from __future__ import annotations
from datetime import date
from io import BytesIO, StringIO
from typing import Any

import csv
import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.assets.constants import control_applies
from app.assets.models import Asset, AssetConflict, AssetSecurityControl, ControlType


def dashboard_summary(db: Session) -> dict[str, Any]:
    total = db.scalar(select(func.count()).select_from(Asset)) or 0

    today = date.today()
    eos_count = db.scalar(
        select(func.count()).select_from(Asset).where(
            func.coalesce(Asset.override_os_eos, Asset.system_os_eos) <= today
        )
    ) or 0

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

    unknown = db.scalar(
        select(func.count()).select_from(Asset).where(
            func.coalesce(Asset.override_asset_type, Asset.system_asset_type).in_(["Unknown", None])
        )
    ) or 0

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


# All available export columns in display order.
ALL_EXPORT_COLUMNS = [
    "ID", "UUID", "Hostname", "MAC", "IPs", "Asset Type", "Asset Status",
    "Environment", "Location", "OS", "OS Version", "OS EOS",
    "First Seen", "Last Seen", "Confidence", "Criticality", "Criticality Score",
]


def _build_asset_rows(
    db: Session,
    *,
    asset_type: str | None = None,
    location: str | None = None,
    environment: str | None = None,
    criticality: str | None = None,
    eos_only: bool = False,
    missing_control: str | None = None,
    installed_control: str | None = None,
    columns: list[str] | None = None,
) -> list[dict]:
    """Fetch assets with optional filters and build row dicts."""
    stmt = select(Asset)

    if asset_type:
        from sqlalchemy import or_
        stmt = stmt.where(or_(
            Asset.system_asset_type == asset_type,
            Asset.override_asset_type == asset_type,
        ))
    if location:
        from sqlalchemy import or_
        stmt = stmt.where(or_(
            Asset.system_location == location,
            Asset.override_location == location,
        ))
    if environment:
        from sqlalchemy import or_
        stmt = stmt.where(or_(
            Asset.system_environment == environment,
            Asset.override_environment == environment,
        ))
    if eos_only:
        today = date.today()
        stmt = stmt.where(func.coalesce(Asset.override_os_eos, Asset.system_os_eos) <= today)

    assets = db.scalars(stmt).all()

    # Post-filter by criticality (needs join; simpler in Python for now)
    if criticality:
        assets = [a for a in assets if a.criticality and a.criticality.level == criticality]

    # Post-filter by control presence
    if missing_control:
        filtered = []
        for a in assets:
            link = next((c for c in a.controls if c.control_type.code == missing_control), None)
            applicable = True
            if link is None:
                atype = a.effective("asset_type") or "Unknown"
                applicable = control_applies(missing_control, atype)
            if applicable and (link is None or link.effective_status != "Installed"):
                filtered.append(a)
        assets = filtered

    if installed_control:
        assets = [
            a for a in assets
            if any(c.control_type.code == installed_control and c.effective_status == "Installed"
                   for c in a.controls)
        ]

    # Determine control codes to include
    all_control_codes = sorted({c.control_type.code for a in assets for c in a.controls})
    want_cols = set(columns) if columns else None

    rows = []
    for a in assets:
        row: dict[str, Any] = {}

        def _add(col: str, val: Any):
            if want_cols is None or col in want_cols:
                row[col] = val

        _add("ID", a.id)
        _add("UUID", a.uuid)
        _add("Hostname", a.effective("hostname"))
        _add("MAC", a.effective("mac"))
        _add("IPs", ", ".join(i.ip for i in a.ips))
        _add("Asset Type", a.effective("asset_type"))
        _add("Asset Status", a.effective("asset_status"))
        _add("Environment", a.effective("environment"))
        _add("Location", a.effective("location"))
        _add("OS", a.effective("os"))
        _add("OS Version", a.effective("os_version"))
        _add("OS EOS", a.effective("os_eos"))
        _add("First Seen", a.first_seen)
        _add("Last Seen", a.last_seen)
        _add("Confidence", a.confidence_score)
        _add("Criticality", a.criticality.level if a.criticality else None)
        _add("Criticality Score", a.criticality.score if a.criticality else None)

        for code in all_control_codes:
            col = f"Ctrl:{code}"
            if want_cols is None or col in want_cols:
                link = next((c for c in a.controls if c.control_type.code == code), None)
                row[col] = link.effective_status if link else "N/A"

        rows.append(row)

    return rows


def export_assets_excel(
    db: Session,
    *,
    asset_type: str | None = None,
    location: str | None = None,
    environment: str | None = None,
    criticality: str | None = None,
    eos_only: bool = False,
    missing_control: str | None = None,
    installed_control: str | None = None,
    columns: list[str] | None = None,
) -> bytes:
    rows = _build_asset_rows(
        db,
        asset_type=asset_type, location=location, environment=environment,
        criticality=criticality, eos_only=eos_only,
        missing_control=missing_control, installed_control=installed_control,
        columns=columns,
    )
    buf = BytesIO()
    df = pd.DataFrame(rows) if rows else pd.DataFrame(columns=columns or ALL_EXPORT_COLUMNS)
    with pd.ExcelWriter(buf, engine="xlsxwriter") as writer:
        df.to_excel(writer, sheet_name="Assets", index=False)
        ws = writer.sheets["Assets"]
        # Auto-fit column widths (capped at 60)
        for i, col in enumerate(df.columns):
            max_len = max(len(str(col)), df[col].astype(str).map(len).max() if len(df) else 0)
            ws.set_column(i, i, min(max_len + 2, 60))
    return buf.getvalue()


def export_assets_csv(
    db: Session,
    *,
    asset_type: str | None = None,
    location: str | None = None,
    environment: str | None = None,
    criticality: str | None = None,
    eos_only: bool = False,
    missing_control: str | None = None,
    installed_control: str | None = None,
    columns: list[str] | None = None,
) -> str:
    rows = _build_asset_rows(
        db,
        asset_type=asset_type, location=location, environment=environment,
        criticality=criticality, eos_only=eos_only,
        missing_control=missing_control, installed_control=installed_control,
        columns=columns,
    )
    if not rows:
        return ""
    buf = StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()
