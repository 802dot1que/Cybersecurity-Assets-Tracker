from sqlalchemy.orm import Session

from app.audit.models import AuditLog


def record(
    db: Session,
    *,
    entity_type: str,
    entity_id: int,
    action: str,
    field: str | None = None,
    old_value=None,
    new_value=None,
    user_id: int | None = None,
    extra: dict | None = None,
) -> AuditLog:
    """Append-only audit write. Caller controls commit."""
    entry = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        field=field,
        old_value=None if old_value is None else str(old_value),
        new_value=None if new_value is None else str(new_value),
        user_id=user_id,
        extra=extra or {},
    )
    db.add(entry)
    return entry
