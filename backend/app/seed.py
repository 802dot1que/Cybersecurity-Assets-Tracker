"""Seed control types and an admin user.

Run inside the api container:
    docker compose exec api python -m app.seed
"""
from sqlalchemy import select

from app.assets.constants import CONTROL_APPLICABILITY
from app.assets.models import ControlType
from app.auth.models import User
from app.core.db import SessionLocal
from app.core.security import hash_password


CONTROL_SEED = [
    ("EDR",   "Endpoint Detection & Response"),
    ("AV",    "Antivirus"),
    ("SIEM",  "SIEM"),
    ("PATCH", "Patch Management"),
    ("DLP",   "Data Loss Prevention"),
    ("VA",    "Vulnerability Assessment Agent"),
    ("PAM",   "Privileged Access Management"),
]


def seed():
    db = SessionLocal()
    try:
        for code, name in CONTROL_SEED:
            if db.scalar(select(ControlType).where(ControlType.code == code)):
                continue
            db.add(ControlType(
                code=code, name=name,
                applies_to_asset_types=sorted(CONTROL_APPLICABILITY.get(code, set())),
                is_active=True,
            ))

        if not db.scalar(select(User).where(User.email == "admin@example.com")):
            db.add(User(
                email="admin@example.com",
                full_name="Admin",
                hashed_password=hash_password("admin123"),
                role="admin",
            ))
        db.commit()
        print("Seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
