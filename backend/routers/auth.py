from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
from auth import create_access_token, hash_password, require_user, verify_password
from database import get_db
from models import User
from schemas import (
    APIKeyCreate,
    APIKeyCreateResponse,
    APIKeyResponse,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(data: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        name=data.name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(require_user)):
    return UserResponse.model_validate(user)


# --- API Keys ---

@router.post("/api-keys", response_model=APIKeyCreateResponse, status_code=201)
def create_api_key(data: APIKeyCreate, db: Session = Depends(get_db)):
    key, raw_key = crud.create_api_key(db, data.user_label)
    return APIKeyCreateResponse(
        id=key.id,
        user_label=key.user_label,
        created_at=key.created_at,
        last_used_at=key.last_used_at,
        is_active=key.is_active,
        raw_key=raw_key,
    )


@router.get("/api-keys", response_model=list[APIKeyResponse])
def list_api_keys(db: Session = Depends(get_db)):
    return crud.get_api_keys(db)


@router.delete("/api-keys/{key_id}")
def revoke_api_key(key_id: int, db: Session = Depends(get_db)):
    if not crud.revoke_api_key(db, key_id):
        raise HTTPException(status_code=404, detail="API key not found")
    return {"success": True}
