from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.assets.routes import router as assets_router
from app.auth.routes import router as auth_router
from app.audit.routes import router as audit_router
from app.ingestion.routes import router as ingestion_router
from app.reports.routes import router as reports_router
from app.nessus.routes import router as nessus_router

# Import models so Alembic autogenerate can see them
from app.assets import models as _assets_models  # noqa: F401
from app.auth import models as _auth_models  # noqa: F401
from app.audit import models as _audit_models  # noqa: F401
from app.ingestion import models as _ingestion_models  # noqa: F401
from app.nessus import models as _nessus_models  # noqa: F401


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.APP_NAME, version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router)
    app.include_router(assets_router)
    app.include_router(ingestion_router)
    app.include_router(audit_router)
    app.include_router(reports_router)
    app.include_router(nessus_router)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    return app


app = create_app()
