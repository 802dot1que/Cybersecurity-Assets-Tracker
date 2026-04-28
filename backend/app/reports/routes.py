from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response, StreamingResponse
from io import BytesIO
from sqlalchemy.orm import Session
from typing import Optional

from app.auth.models import User
from app.core.db import get_db
from app.core.deps import get_current_user
from app.reports.service import (
    ALL_EXPORT_COLUMNS,
    dashboard_summary,
    export_assets_csv,
    export_assets_excel,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return dashboard_summary(db)


@router.get("/export/columns")
def list_export_columns(_: User = Depends(get_current_user)):
    """Return the list of available export columns so the UI can build a picker."""
    return {"columns": ALL_EXPORT_COLUMNS}


@router.get("/export/assets")
def export_assets(
    format: str = Query("xlsx", description="xlsx or csv"),
    asset_type: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    environment: Optional[str] = Query(None),
    criticality: Optional[str] = Query(None, description="Low|Medium|High|Critical"),
    eos_only: bool = Query(False, description="Only assets with EOS OS"),
    missing_control: Optional[str] = Query(None, description="Control code — assets missing this control"),
    installed_control: Optional[str] = Query(None, description="Control code — assets with this control installed"),
    columns: Optional[str] = Query(None, description="Comma-separated list of columns to include"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Filtered asset export. Supports xlsx and csv formats."""
    col_list = [c.strip() for c in columns.split(",")] if columns else None

    if format == "csv":
        data = export_assets_csv(
            db,
            asset_type=asset_type, location=location, environment=environment,
            criticality=criticality, eos_only=eos_only,
            missing_control=missing_control, installed_control=installed_control,
            columns=col_list,
        )
        return Response(
            content=data.encode("utf-8"),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="assets.csv"'},
        )

    data = export_assets_excel(
        db,
        asset_type=asset_type, location=location, environment=environment,
        criticality=criticality, eos_only=eos_only,
        missing_control=missing_control, installed_control=installed_control,
        columns=col_list,
    )
    return StreamingResponse(
        BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="assets.xlsx"'},
    )


# Legacy endpoint kept for backwards compatibility
@router.get("/export/assets.xlsx")
def export_assets_legacy(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    data = export_assets_excel(db)
    return StreamingResponse(
        BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="assets.xlsx"'},
    )
