from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
from database import get_db
from schemas import APIKeyCreate, APIKeyCreateResponse, APIKeyResponse

router = APIRouter(prefix="/auth", tags=["auth"])


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
