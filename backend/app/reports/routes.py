from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from io import BytesIO
from sqlalchemy.orm import Session

from app.auth.models import User
from app.core.db import get_db
from app.core.deps import get_current_user
from app.reports.service import dashboard_summary, export_assets_excel

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return dashboard_summary(db)


@router.get("/export/assets.xlsx")
def export_assets(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    data = export_assets_excel(db)
    return StreamingResponse(
        BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="assets.xlsx"'},
    )
