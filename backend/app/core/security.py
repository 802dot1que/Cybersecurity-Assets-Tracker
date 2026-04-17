from datetime import datetime, timedelta, timezone
import bcrypt
from jose import jwt, JWTError

from app.core.config import get_settings

settings = get_settings()


def _truncate(p: str) -> bytes:
    # bcrypt silently ignores bytes beyond 72; we truncate explicitly to stay safe
    # across bcrypt lib versions (some raise on >72 bytes).
    return p.encode("utf-8")[:72]


def hash_password(p: str) -> str:
    return bcrypt.hashpw(_truncate(p), bcrypt.gensalt()).decode("utf-8")


def verify_password(p: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_truncate(p), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(sub: str, extra: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": sub,
        "iat": now,
        "exp": now + timedelta(minutes=settings.JWT_ACCESS_TTL_MIN),
        "typ": "access",
        **(extra or {}),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    except JWTError as e:
        raise ValueError(str(e)) from e
