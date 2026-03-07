import csv
import io
import logging
import os
import uuid
import zipfile
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from sqlalchemy.orm import Session, joinedload

import crud
from auth import require_user, get_authorized_plot, get_authorized_trial, check_trial_access
from database import get_db
from models import Image, Plot, Trial, User
from schemas import HeightPredictionResponse, ImageResponse, SeverityPredictionResponse
from services.ai_classifier import predict_height, predict_severity
from services.storage import get_storage, LocalStorage, SupabaseStorage

logger = logging.getLogger(__name__)

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
    """Verify user has access to an image via plot -> trial ownership."""
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
    user: User = Depends(require_user),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=422, detail=f"Unsupported file type: {file.content_type}"
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=422, detail="File too large (max 5MB)")

    ext = os.path.splitext(file.filename or "image.jpg")[1] or ".jpg"
    uuid_name = f"{uuid.uuid4().hex}{ext}"

    # Build structured storage path: user_{id}/trial_{id}/plot_{id}/{uuid}.ext
    trial_id = plot.trial_id
    storage_path = f"user_{user.id}/{trial_id}/{plot.id}/{uuid_name}"

    storage = get_storage()
    storage.save(storage_path, contents)

    return crud.create_image(
        db, plot.id, uuid_name, file.filename or "image.jpg",
        image_type=image_type, storage_path=storage_path,
    )


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
    # Delete using storage_path if available, else bare filename
    storage.delete(image.storage_path or image.filename)

    db.delete(image)
    db.commit()
    return {"success": True}


@router.get("/images/download/{image_id}")
def download_image(
    image_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    """Authenticated image download — returns redirect to signed URL or streams bytes."""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    _check_image_access(db, image, user)

    storage = get_storage()
    path = image.storage_path or image.filename
    if isinstance(storage, LocalStorage):
        if not storage.exists(path):
            raise HTTPException(status_code=404, detail="Image file not found")
        return FileResponse(storage._path(path))
    else:
        url = storage.get_url(path)
        return RedirectResponse(url=url)


# Image file serving — no auth (UUID filenames are unguessable, <img src> can't send headers)
@router.get("/images/{filename}")
def serve_image(filename: str):
    storage = get_storage()

    # Try storage_path-aware lookup: first try bare filename, then check if it's a known file
    if isinstance(storage, LocalStorage):
        if not storage.exists(filename):
            raise HTTPException(status_code=404, detail="Image not found")
        return FileResponse(storage._path(filename))
    else:
        # For cloud storage (Supabase/GCS), redirect to public URL.
        url = storage.get_url(filename)
        return RedirectResponse(url=url)


# ─── ZIP Download ─────────────────────────────────────────────────────────────

def _sanitize(s: str) -> str:
    """Remove characters that are problematic in filenames."""
    return "".join(c if c.isalnum() or c in "-_." else "_" for c in (s or "unknown"))


@router.get("/trials/{trial_id}/download-images")
def download_trial_images(
    trial_id: int,
    round_id: int | None = Query(None),
    db: Session = Depends(get_db),
    trial: Trial = Depends(get_authorized_trial),
):
    """Stream a ZIP of all images for a trial, with manifest.csv."""
    # Query images via Plot -> Trial join
    query = (
        db.query(Image)
        .join(Plot, Image.plot_id == Plot.id)
        .filter(Plot.trial_id == trial_id)
    )
    if round_id:
        # Filter by images uploaded during this round's time window (approximate)
        from models import ScoringRound
        sr = db.query(ScoringRound).filter(ScoringRound.id == round_id).first()
        if sr and sr.scored_at:
            query = query.filter(Image.uploaded_at >= sr.created_at)

    images = query.all()
    if not images:
        raise HTTPException(status_code=404, detail="No images found for this trial")

    # Preload plot data
    plot_ids = {img.plot_id for img in images}
    plots = {p.id: p for p in db.query(Plot).filter(Plot.id.in_(plot_ids)).all()}

    trial_name = _sanitize(trial.name)
    storage = get_storage()

    def generate_zip():
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Build manifest
            manifest_rows = []

            for img in images:
                plot = plots.get(img.plot_id)
                if not plot:
                    continue

                ext = os.path.splitext(img.filename)[1] or ".jpg"
                date_str = img.uploaded_at.strftime("%Y%m%d") if img.uploaded_at else "unknown"
                zip_filename = f"{trial_name}/{plot.plot_id}_{_sanitize(plot.genotype)}_{img.image_type}_{date_str}{ext}"

                row = {
                    "filename": zip_filename,
                    "plot_id": plot.plot_id,
                    "genotype": plot.genotype,
                    "rep": str(plot.rep),
                    "row": str(plot.row),
                    "column": str(plot.column),
                    "image_type": img.image_type,
                    "uploaded_at": img.uploaded_at.isoformat() if img.uploaded_at else "",
                    "storage_path": img.storage_path or img.filename,
                    "status": "OK",
                }

                try:
                    path = img.storage_path or img.filename
                    image_bytes = storage.get_bytes(path)
                    zf.writestr(zip_filename, image_bytes)
                except Exception as e:
                    logger.warning("Failed to fetch image %s: %s", img.filename, e)
                    row["status"] = "MISSING"

                manifest_rows.append(row)

            # Write manifest.csv
            if manifest_rows:
                csv_buf = io.StringIO()
                writer = csv.DictWriter(csv_buf, fieldnames=manifest_rows[0].keys())
                writer.writeheader()
                writer.writerows(manifest_rows)
                zf.writestr(f"{trial_name}/manifest.csv", csv_buf.getvalue())

        buffer.seek(0)
        yield buffer.read()

    return StreamingResponse(
        generate_zip(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{trial_name}_images.zip"',
        },
    )


# ─── AI Predictions ───────────────────────────────────────────────────────────

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
    path = image.storage_path or image.filename
    if not storage.exists(path):
        raise HTTPException(status_code=404, detail="Image file not found")

    image_bytes = storage.get_bytes(path)
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
    path = image.storage_path or image.filename
    if not storage.exists(path):
        raise HTTPException(status_code=404, detail="Image file not found")

    image_bytes = storage.get_bytes(path)
    ext = os.path.splitext(image.filename)[1].lower()
    mime_type = MIME_MAP.get(ext, "image/jpeg")

    result = await predict_height(image_bytes, mime_type)
    if result is None:
        raise HTTPException(
            status_code=503,
            detail="AI height estimation unavailable. Enter height manually.",
        )

    return result
