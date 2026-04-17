"""Ingestion orchestrator. Reads raw rows, normalizes, correlates, merges/creates assets."""
from __future__ import annotations
import uuid as uuidlib
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from sqlalchemy.orm import Session

from app.assets.models import Asset, AssetIP, AssetConflict
from app.audit.service import record as audit
from app.correlation.service import correlate
from app.ingestion.models import IngestionBatch, IngestionRecord
from app.ingestion.normalize import CANONICAL_FIELDS
from app.ingestion.parser import normalize_row, read_excel

# Fields copied from normalized row to asset.system_* on create/merge.
OVERRIDABLE_NORMALIZED = ("hostname", "mac", "asset_type", "os", "os_version", "os_eos")


def run_excel_ingestion(
    db: Session,
    *,
    filename: str,
    content: bytes,
    mapping: dict[str, str],
    source: str = "excel",
    uploaded_by: int | None = None,
) -> IngestionBatch:
    df = read_excel(content)
    batch = IngestionBatch(
        filename=filename, source=source, mapping=mapping,
        row_count=len(df), uploaded_by=uploaded_by, status="processing",
    )
    db.add(batch)
    db.flush()

    for idx, raw in enumerate(df.to_dict(orient="records")):
        raw = {k: (None if pd.isna(v) else v) for k, v in raw.items()}
        rec = IngestionRecord(batch_id=batch.id, row_index=idx, raw=raw)
        db.add(rec)
        try:
            normalized = normalize_row(raw, mapping)
            rec.normalized = _jsonable(normalized)
            asset, action, confidence = _merge_or_create(
                db, normalized, source=source, user_id=uploaded_by
            )
            rec.asset_id = asset.id
            rec.action = action
            rec.match_confidence = confidence
            if action == "created":
                batch.created_count += 1
            elif action == "merged":
                batch.merged_count += 1
        except Exception as e:  # noqa: BLE001
            rec.action = "error"
            rec.error = str(e)
            batch.error_count += 1

    batch.status = "completed"
    batch.finished_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(batch)
    return batch


def _jsonable(d: dict) -> dict:
    out = {}
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def _merge_or_create(
    db: Session, normalized: dict[str, Any], *, source: str, user_id: int | None
) -> tuple[Asset, str, float]:
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
              user_id=user_id, extra={"source": source, "created": True})
        return asset, "created", 1.0

    asset, confidence = match
    _apply_system_fields(db, asset, normalized, source=source, is_new=False)
    asset.last_seen = now
    asset.confidence_score = max(asset.confidence_score or 0.0, confidence)
    audit(db, entity_type="asset", entity_id=asset.id, action="ingest",
          user_id=user_id, extra={"source": source, "merged": True, "confidence": confidence})
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
