from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: str = "analyst"


class UserRead(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
