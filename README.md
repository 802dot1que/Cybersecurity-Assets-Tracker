# Cybersecurity Asset Inventory

Unified asset inventory with Excel ingestion, manual overrides, correlation, security control tracking, criticality scoring, audit log, and dashboards.

## Stack
- **Backend:** FastAPI · SQLAlchemy 2.0 · Alembic · PostgreSQL 16 · Redis + RQ · pandas · rapidfuzz
- **Frontend:** React 18 · TypeScript · Vite · Tailwind · shadcn/ui · TanStack Query/Table
- **Deploy:** Docker Compose (api, worker, web, postgres, redis, nginx)

## Quick Start

```bash
docker compose up --build
```

- API: http://localhost:8000 (docs: `/docs`)
- Web: http://localhost:5173
- Postgres: localhost:5432 (user/pass in `.env`)

First run:
```bash
docker compose exec api alembic upgrade head
docker compose exec api python -m app.seed
```

## Project Layout

```
backend/
  app/
    core/          # config, db, security, deps
    auth/          # JWT auth
    assets/        # asset model + CRUD + effective-value serializer
    ingestion/     # Excel upload, column mapping, raw storage
    correlation/   # dedup + fuzzy matching
    controls/      # dynamic security-control types & applicability
    criticality/   # scoring engine (questionnaire-ready)
    overrides/     # override service + history
    audit/         # audit log
    reports/       # dashboard aggregations + Excel export
frontend/
  src/
    pages/         # Dashboard, Assets, AssetDetail, Upload, Audit
    components/    # Table, OverrideField, ControlsPanel, ...
docker/            # Dockerfiles + nginx.conf
```

## Core Design

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
