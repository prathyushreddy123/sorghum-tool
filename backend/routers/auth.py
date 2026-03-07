from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import crud
from auth import create_access_token, hash_password, require_user, verify_password
from database import get_db
from models import User
from config import settings
from services.email import send_password_reset_email, send_verification_email
from schemas import (
    APIKeyCreate,
    APIKeyCreateResponse,
    APIKeyResponse,
    ForgotPasswordRequest,
    ResetPasswordRequest,
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
        email_verified=False,
        verification_grace_expires=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Send verification email
    raw_token = crud.create_email_verification_token(db, user.id)
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={raw_token}"
    send_verification_email(user.email, verify_url)

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/verify-email")
def verify_email(token: str = Query(...), db: Session = Depends(get_db)):
    """Verify email using the token from the verification email."""
    evt = crud.verify_email_token(db, token)
    if not evt:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
    user = crud.use_email_verification_token(db, evt)
    return {"message": "Email verified successfully", "user": UserResponse.model_validate(user)}


@router.post("/resend-verification")
def resend_verification(
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    """Resend verification email. Rate-limited to 1 per 2 minutes."""
    if user.email_verified:
        return {"message": "Email already verified"}

    last_sent = crud.get_last_verification_token_time(db, user.id)
    if last_sent:
        from datetime import timezone
        last_utc = last_sent.replace(tzinfo=timezone.utc) if last_sent.tzinfo is None else last_sent
        if (datetime.now(timezone.utc) - last_utc).total_seconds() < 120:
            raise HTTPException(status_code=429, detail="Please wait 2 minutes before requesting another verification email")

    raw_token = crud.create_email_verification_token(db, user.id)
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={raw_token}"
    send_verification_email(user.email, verify_url)
    return {"message": "Verification email sent"}


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


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Generate a reset token and send email. Always returns 200 to prevent email enumeration."""
    user = db.query(User).filter(User.email == data.email).first()
    if user:
        raw_token = crud.create_password_reset_token(db, user.id)
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
        send_password_reset_email(user.email, reset_url)
    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/verify-reset-token")
def verify_reset_token(token: str, db: Session = Depends(get_db)):
    """Check if a reset token is valid."""
    prt = crud.verify_reset_token(db, token)
    if not prt:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    return {"valid": True}


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset password using a valid token."""
    prt = crud.verify_reset_token(db, data.token)
    if not prt:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    new_hash = hash_password(data.password)
    crud.use_reset_token(db, prt, new_hash)
    return {"message": "Password reset successfully"}


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
