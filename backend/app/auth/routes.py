from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.auth.models import User
from app.auth.schemas import TokenOut, UserCreate, UserRead

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == form.username))
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Inactive")
    return TokenOut(access_token=create_access_token(str(user.id), {"role": user.role}))


@router.post("/register", response_model=UserRead, status_code=201)
def register(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email exists")
    u = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@router.get("/me", response_model=UserRead)
def me(current: User = Depends(get_current_user)):
    return current
