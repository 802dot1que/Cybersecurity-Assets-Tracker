"""Reset all asset/ingestion data while keeping schema and seed data intact.

Usage (from repo root):
    docker compose exec backend python scripts/reset_data.py
    # or locally:
    cd backend && python scripts/reset_data.py

Clears:
  - asset_criticality
  - asset_conflicts
  - asset_security_controls
  - asset_ips
  - assets
  - ingestion_records
  - ingestion_batches
  - audit_log  (if present)

Preserves:
  - users
  - control_types  (catalog / seed data)
  - column_mappings
  - alembic_version (schema history)
"""
import sys
import os

# Allow running from repo root or from backend/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from app.core.db import SessionLocal

TRUNCATE_ORDER = [
    "asset_criticality",
    "asset_conflicts",
    "asset_security_controls",
    "asset_ips",
    "assets",
    "ingestion_records",
    "ingestion_batches",
    "audit_log",  # may not exist in all environments
]


def reset_data(dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        print("=== Asset Inventory — Data Reset ===")
        if dry_run:
            print("[DRY RUN] No changes will be committed.\n")

        for table in TRUNCATE_ORDER:
            try:
                result = db.execute(text(f"SELECT COUNT(*) FROM {table}"))
                count = result.scalar()
                if dry_run:
                    print(f"  Would truncate {table!r} ({count} rows)")
                else:
                    db.execute(text(f"TRUNCATE TABLE {table} CASCADE"))
                    print(f"  Truncated {table!r} ({count} rows removed)")
            except Exception as e:
                print(f"  Skipped {table!r}: {e}")

        if not dry_run:
            db.commit()
            print("\nDone. Database is empty and ready for re-ingestion.")
        else:
            db.rollback()
            print("\nDry run complete. No changes made.")
    except Exception as e:
        db.rollback()
        print(f"\nError: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    if not dry:
        confirm = input(
            "\nThis will DELETE ALL asset data (assets, ingestion history, audit logs).\n"
            "Schema and user accounts are preserved.\n"
            "Type 'yes' to continue: "
        ).strip().lower()
        if confirm != "yes":
            print("Aborted.")
            sys.exit(0)
    reset_data(dry_run=dry)
