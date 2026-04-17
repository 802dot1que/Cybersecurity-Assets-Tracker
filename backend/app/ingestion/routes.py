from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import select
import json

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import get_current_user
from app.auth.models import User
from app.ingestion.models import ColumnMapping, IngestionBatch
from app.ingestion.parser import read_excel, suggest_control_columns, suggest_mapping
from app.ingestion.service import run_excel_ingestion

router = APIRouter(prefix="/api/ingestion", tags=["ingestion"])
settings = get_settings()


@router.post("/preview")
async def preview_upload(
    file: UploadFile = File(...),
    current: User = Depends(get_current_user),
):
    """Returns detected columns + suggested mapping + first 5 rows."""
    content = await file.read()
    _check_size(content)
    df = read_excel(content)
    cols = list(df.columns)
    return {
        "columns": cols,
        "suggested_mapping": suggest_mapping(cols),
        "suggested_control_columns": suggest_control_columns(cols),
        "sample_rows": df.head(5).fillna("").to_dict(orient="records"),
        "total_rows": len(df),
    }


@router.post("/upload", response_model=dict)
async def upload(
    file: UploadFile = File(...),
    mapping: str = Form(..., description="JSON object: {canonical_field: excel_column}"),
    control_mapping: str = Form("{}", description="JSON object: {control_code: excel_column}"),
    source: str = Form("excel"),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    content = await file.read()
    _check_size(content)
    try:
        mapping_dict = json.loads(mapping)
        control_dict = json.loads(control_mapping)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Invalid mapping JSON: {e}") from e
    batch = run_excel_ingestion(
        db, filename=file.filename or "upload.xlsx",
        content=content, mapping=mapping_dict,
        control_mapping=control_dict,
        source=source, uploaded_by=current.id,
    )
    return {
        "batch_id": batch.id,
        "row_count": batch.row_count,
        "created": batch.created_count,
        "merged": batch.merged_count,
        "errors": batch.error_count,
    }


@router.get("/batches")
def list_batches(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.scalars(select(IngestionBatch).order_by(IngestionBatch.created_at.desc())).all()
    return [
        {
            "id": b.id, "filename": b.filename, "source": b.source, "status": b.status,
            "rows": b.row_count, "created": b.created_count, "merged": b.merged_count,
            "errors": b.error_count, "created_at": b.created_at,
        }
        for b in rows
    ]


@router.get("/mappings")
def list_mappings(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.scalars(select(ColumnMapping)).all()


@router.post("/mappings")
def save_mapping(
    payload: dict,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    m = ColumnMapping(
        name=payload["name"], source=payload.get("source", "excel"),
        mapping=payload["mapping"], created_by=current.id,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return {"id": m.id}


def _check_size(content: bytes):
    if len(content) > settings.UPLOAD_MAX_MB * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {settings.UPLOAD_MAX_MB}MB limit")
