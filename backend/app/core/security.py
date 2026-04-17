from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext

from app.core.config import get_settings

settings = get_settings()
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(p: str) -> str:
    return pwd_ctx.hash(p)


def verify_password(p: str, hashed: str) -> bool:
    return pwd_ctx.verify(p, hashed)


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
