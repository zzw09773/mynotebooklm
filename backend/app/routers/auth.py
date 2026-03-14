"""
Authentication API routes – register, login, and user info.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator

from app.models import User, create_user, get_user_by_username
from app.services.auth_service import hash_password, verify_password, create_access_token
from app.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["認證"])


# ── Request / Response schemas ────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3 or len(v) > 50:
            raise ValueError("使用者名稱長度須為 3-50 個字元。")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("密碼長度至少 8 個字元。")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: "UserInfo"


class UserInfo(BaseModel):
    id: int
    username: str
    created_at: str


# ── Endpoints ─────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED, summary="註冊新帳號")
async def register(req: RegisterRequest):
    existing = get_user_by_username(req.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="此使用者名稱已被使用。",
        )

    password_hash = hash_password(req.password)
    user = create_user(req.username, password_hash)
    token = create_access_token(user.id, user.username)

    return AuthResponse(
        token=token,
        user=UserInfo(id=user.id, username=user.username, created_at=user.created_at),
    )


@router.post("/login", response_model=AuthResponse, summary="登入")
async def login(req: LoginRequest):
    user = get_user_by_username(req.username)
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="使用者名稱或密碼錯誤。",
        )

    token = create_access_token(user.id, user.username)
    return AuthResponse(
        token=token,
        user=UserInfo(id=user.id, username=user.username, created_at=user.created_at),
    )


@router.get("/me", response_model=UserInfo, summary="取得目前使用者資訊")
async def get_me(current_user: User = Depends(get_current_user)):
    return UserInfo(
        id=current_user.id,
        username=current_user.username,
        created_at=current_user.created_at,
    )
