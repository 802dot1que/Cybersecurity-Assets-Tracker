from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.core.deps import get_db
from app.nessus import client as nessus
from app.nessus.connector import run_full_sync
from app.nessus.models import Vulnerability, NessusSyncLog
from app.nessus.schemas import (
    NessusStatusOut, NessusScanOut, SyncLogOut, VulnerabilityOut, VulnPage
)

router = APIRouter(prefix="/api/nessus", tags=["nessus"])


@router.get("/status", response_model=NessusStatusOut)
def nessus_status():
    try:
        data = nessus.get_server_status()
        status_val = data.get("status")
        is_ready = status_val == "ready"
        return NessusStatusOut(
            connected=is_ready,
            status=status_val,
            code=data.get("code"),
            error=None if is_ready else f"Nessus status: {status_val}",
        )
    except Exception as exc:
        return NessusStatusOut(connected=False, status=None, code=None, error=str(exc))


@router.get("/scans", response_model=list[NessusScanOut])
def list_scans():
    try:
        scans = nessus.list_scans()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Nessus unreachable: {exc}")
    return [
        NessusScanOut(
            id=s.get("id"),
            name=s.get("name", ""),
            status=s.get("status", ""),
            folder_id=s.get("folder_id"),
            last_modification_date=s.get("last_modification_date"),
            creation_date=s.get("creation_date"),
            type=s.get("type"),
        )
        for s in (scans or [])
    ]


@router.post("/sync", response_model=SyncLogOut)
def sync_all(db: Session = Depends(get_db)):
    try:
        log = run_full_sync(db)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return SyncLogOut.model_validate(log)


@router.post("/sync/{scan_id}", response_model=SyncLogOut)
def sync_one(scan_id: int, db: Session = Depends(get_db)):
    try:
        log = run_full_sync(db, scan_id=scan_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return SyncLogOut.model_validate(log)


@router.get("/syncs", response_model=list[SyncLogOut])
def sync_history(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    rows = db.execute(
        select(NessusSyncLog).order_by(NessusSyncLog.started_at.desc()).limit(limit)
    ).scalars().all()
    return [SyncLogOut.model_validate(r) for r in rows]


@router.get("/vulnerabilities", response_model=VulnPage)
def list_vulnerabilities(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    severity: str | None = Query(None),
    asset_id: int | None = Query(None),
    scan_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    q = select(Vulnerability)
    if severity:
        q = q.where(Vulnerability.severity == severity)
    if asset_id is not None:
        q = q.where(Vulnerability.asset_id == asset_id)
    if scan_id is not None:
        q = q.where(Vulnerability.source_scan_id == scan_id)

    total = db.execute(select(func.count()).select_from(q.subquery())).scalar_one()
    rows = db.execute(
        q.order_by(Vulnerability.severity_id.desc(), Vulnerability.last_seen.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()

    return VulnPage(
        items=[VulnerabilityOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )
