import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

import crud
from auth import require_user, get_authorized_plot, check_trial_access
from database import get_db
from models import Image, Plot, User
from schemas import HeightPredictionResponse, ImageResponse, SeverityPredictionResponse
from services.ai_classifier import predict_height, predict_severity
from services.storage import get_storage, LocalStorage, SupabaseStorage

router = APIRouter(tags=["images"])

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}

MIME_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
}


def _check_image_access(db: Session, image: Image, user: User) -> None:
    """Verify user has access to an image via plot → trial ownership."""
    plot = crud.get_plot(db, image.plot_id)
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    check_trial_access(db, plot.trial_id, user)


@router.post("/plots/{plot_id}/images", response_model=ImageResponse, status_code=201)
async def upload_image(
    plot_id: int,
    file: UploadFile = File(...),
    image_type: str = Query("panicle", pattern="^(panicle|full_plant)$"),
    db: Session = Depends(get_db),
    plot: Plot = Depends(get_authorized_plot),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=422, detail=f"Unsupported file type: {file.content_type}"
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=422, detail="File too large (max 5MB)")

    ext = os.path.splitext(file.filename or "image.jpg")[1] or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"

    storage = get_storage()
    storage.save(filename, contents)

    return crud.create_image(db, plot.id, filename, file.filename or "image.jpg", image_type=image_type)


@router.get("/plots/{plot_id}/images", response_model=list[ImageResponse])
def list_images(
    plot_id: int,
    image_type: str | None = Query(None, pattern="^(panicle|full_plant)$"),
    db: Session = Depends(get_db),
    plot: Plot = Depends(get_authorized_plot),
):
    return crud.get_images(db, plot.id, image_type=image_type)


@router.delete("/images/{image_id}")
def delete_image(
    image_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    _check_image_access(db, image, user)

    storage = get_storage()
    storage.delete(image.filename)

    db.delete(image)
    db.commit()
    return {"success": True}


# Image file serving — no auth (UUID filenames are unguessable, <img src> can't send headers)
@router.get("/images/{filename}")
def serve_image(filename: str):
    storage = get_storage()
    if isinstance(storage, LocalStorage):
        if not storage.exists(filename):
            raise HTTPException(status_code=404, detail="Image not found")
        return FileResponse(storage._path(filename))
    else:
        # For cloud storage (Supabase/GCS), redirect to public URL.
        # Supabase/GCS returns 404 if file doesn't exist, so skip exists() check.
        url = storage.get_url(filename)
        return RedirectResponse(url=url)


@router.post(
    "/images/{image_id}/predict-severity",
    response_model=SeverityPredictionResponse,
)
async def predict_image_severity(
    image_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    _check_image_access(db, image, user)

    storage = get_storage()
    if not storage.exists(image.filename):
        raise HTTPException(status_code=404, detail="Image file not found")

    image_bytes = storage.get_bytes(image.filename)
    ext = os.path.splitext(image.filename)[1].lower()
    mime_type = MIME_MAP.get(ext, "image/jpeg")

    result = await predict_severity(image_bytes, mime_type)
    if result is None:
        raise HTTPException(
            status_code=503,
            detail="AI classification unavailable. Score manually.",
        )

    return result


@router.post(
    "/images/{image_id}/predict-height",
    response_model=HeightPredictionResponse,
)
async def predict_image_height(
    image_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    _check_image_access(db, image, user)

    storage = get_storage()
    if not storage.exists(image.filename):
        raise HTTPException(status_code=404, detail="Image file not found")

    image_bytes = storage.get_bytes(image.filename)
    ext = os.path.splitext(image.filename)[1].lower()
    mime_type = MIME_MAP.get(ext, "image/jpeg")

    result = await predict_height(image_bytes, mime_type)
    if result is None:
        raise HTTPException(
            status_code=503,
            detail="AI height estimation unavailable. Enter height manually.",
        )

    return result
