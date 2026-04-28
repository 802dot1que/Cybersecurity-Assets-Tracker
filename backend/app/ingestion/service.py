"""Ingestion orchestrator. Reads raw rows, normalizes, correlates, merges/creates assets."""
from __future__ import annotations
import uuid as uuidlib
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from sqlalchemy.orm import Session

from app.assets.models import Asset, AssetIP, AssetConflict
from app.audit.service import record as audit
from app.controls.service import upsert_control
from app.correlation.service import correlate
from app.ingestion.models import IngestionBatch, IngestionRecord
from app.ingestion.normalize import CANONICAL_FIELDS
from app.ingestion.parser import cell_to_control_status, normalize_row, read_excel

# Fields copied from normalized row to asset.system_* on create/merge.
OVERRIDABLE_NORMALIZED = (
    "hostname", "mac", "asset_type", "os", "os_version", "os_eos",
    "asset_status", "environment", "location",
)


def run_excel_ingestion(
    db: Session,
    *,
    filename: str,
    content: bytes,
    mapping: dict[str, str],
    source: str = "excel",
    control_mapping: dict[str, str] | None = None,
    uploaded_by: int | None = None,
    skip_asset_ids: set[int] | None = None,
) -> IngestionBatch:
    df = read_excel(content)
    full_mapping = {"fields": mapping, "controls": control_mapping or {}}
    batch = IngestionBatch(
        filename=filename, source=source, mapping=full_mapping,
        row_count=len(df), uploaded_by=uploaded_by, status="processing",
    )
    db.add(batch)
    db.flush()

    _skip = skip_asset_ids or set()

    for idx, raw in enumerate(df.to_dict(orient="records")):
        raw = {k: (None if pd.isna(v) else v) for k, v in raw.items()}
        rec = IngestionRecord(batch_id=batch.id, row_index=idx, raw=raw)
        db.add(rec)
        try:
            normalized = normalize_row(raw, mapping)
            rec.normalized = _jsonable(normalized)
            asset, action, confidence = _merge_or_create(
                db, normalized, source=source, user_id=uploaded_by,
                skip_asset_ids=_skip,
                filename=filename, batch_id=batch.id,
            )
            rec.asset_id = asset.id if asset else None
            rec.action = action
            rec.match_confidence = confidence
            if action == "created":
                batch.created_count += 1
            elif action == "merged":
                batch.merged_count += 1
            elif action == "skipped":
                batch.skipped_count += 1
            if action in ("created", "merged") and asset is not None:
                _apply_control_columns(db, asset, raw, control_mapping or {}, source=source)
        except Exception as e:  # noqa: BLE001
            rec.action = "error"
            rec.error = str(e)
            batch.error_count += 1

    batch.status = "completed"
    batch.finished_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(batch)
    return batch


def _apply_control_columns(
    db: Session, asset: Asset, raw: dict, control_mapping: dict[str, str], *, source: str
) -> None:
    """Write system_status on AssetSecurityControl for each mapped control column."""
    now = datetime.now(timezone.utc)
    for code, col in control_mapping.items():
        if not col:
            continue
        status = cell_to_control_status(raw.get(col))
        try:
            upsert_control(
                db, asset=asset, control_code=code,
                system_status=status, last_check_in=now, source=source,
            )
        except ValueError:
            # Unknown control code — silently skip rather than fail the row.
            continue


def _jsonable(d: dict) -> dict:
    out = {}
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def _merge_or_create(
    db: Session, normalized: dict[str, Any], *, source: str, user_id: int | None,
    skip_asset_ids: set[int] | None = None,
    filename: str | None = None, batch_id: int | None = None,
) -> tuple[Asset | None, str, float]:
    match = correlate(db, normalized)
    now = datetime.now(timezone.utc)

    if match is None:
        asset = Asset(
            uuid=str(uuidlib.uuid4()),
            first_seen=now,
            last_seen=now,
            confidence_score=1.0,
            override_meta={},
        )
        db.add(asset)
        db.flush()
        _apply_system_fields(db, asset, normalized, source=source, is_new=True)
        audit(db, entity_type="asset", entity_id=asset.id, action="ingest",
              user_id=user_id, extra={
                  "source": source, "created": True,
                  "filename": filename, "batch_id": batch_id,
              })
        return asset, "created", 1.0

    asset, confidence = match

    # User explicitly chose to skip merging into this existing asset.
    if skip_asset_ids and asset.id in skip_asset_ids:
        return None, "skipped", confidence

    _apply_system_fields(db, asset, normalized, source=source, is_new=False)
    asset.last_seen = now
    asset.confidence_score = max(asset.confidence_score or 0.0, confidence)
    audit(db, entity_type="asset", entity_id=asset.id, action="ingest",
          user_id=user_id, extra={
              "source": source, "merged": True, "confidence": confidence,
              "filename": filename, "batch_id": batch_id,
          })
    return asset, "merged", confidence


def _apply_system_fields(
    db: Session, asset: Asset, normalized: dict[str, Any], *, source: str, is_new: bool
) -> None:
    """Write system_* fields, preserving overrides. Record conflicts if system value changes."""
    for f in OVERRIDABLE_NORMALIZED:
        new_val = normalized.get(f)
        if new_val is None:
            continue
        old_val = getattr(asset, f"system_{f}")
        if not is_new and old_val and old_val != new_val:
            db.add(AssetConflict(
                asset_id=asset.id, field=f,
                value_a=str(old_val), value_b=str(new_val),
                source_a="previous", source_b=source,
            ))
        setattr(asset, f"system_{f}", new_val)

    # IPs (IPv4 only — normalizer drops v6).
    for ip in normalized.get("ips") or []:
        existing = next((x for x in asset.ips if x.ip == ip), None)
        if existing:
            existing.last_seen = datetime.now(timezone.utc)
            existing.source = source
        else:
            asset.ips.append(AssetIP(
                ip=ip, source=source,
                first_seen=datetime.now(timezone.utc),
                last_seen=datetime.now(timezone.utc),
            ))
