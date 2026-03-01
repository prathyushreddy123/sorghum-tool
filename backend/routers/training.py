"""Training data collection and job management endpoints."""
import csv
import io
import json
import logging
import os
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from auth import require_user, require_admin
from config import settings
from database import get_db
from models import Image, Trait, TrainingSample, TrainingJob, User
from schemas import (
    TrainingSampleCreate, TrainingSampleResponse, TrainingSampleStats,
    TrainingJobCreate, TrainingJobResponse, TrainingJobCompleteCallback,
    ReviewQueueItem,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/training", tags=["training"])

REFERENCE_DIR = Path(__file__).parent.parent / "reference_images"


# ─── Training Samples ────────────────────────────────────────────────────────

@router.post("/samples", response_model=TrainingSampleResponse, status_code=201)
def create_training_sample(body: TrainingSampleCreate, user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Submit a labeled training sample (image + trait_name + value)."""
    image = db.query(Image).filter(Image.id == body.image_id).first()
    if not image:
        raise HTTPException(404, "Image not found")

    # Upsert: update value if same image+trait+crop already exists
    existing = db.query(TrainingSample).filter(
        TrainingSample.image_id == body.image_id,
        TrainingSample.trait_name == body.trait_name,
        TrainingSample.crop == body.crop,
    ).first()
    if existing:
        existing.value = body.value
        existing.source = body.source
        if body.ai_predicted_value is not None:
            existing.ai_predicted_value = body.ai_predicted_value
        if body.ai_confidence is not None:
            existing.ai_confidence = body.ai_confidence
        db.commit()
        db.refresh(existing)
        return existing

    sample = TrainingSample(
        image_id=body.image_id,
        trait_name=body.trait_name,
        crop=body.crop,
        value=body.value,
        source=body.source,
        ai_predicted_value=body.ai_predicted_value,
        ai_confidence=body.ai_confidence,
    )
    db.add(sample)
    db.commit()
    db.refresh(sample)
    return sample


@router.get("/samples", response_model=list[TrainingSampleResponse])
def list_training_samples(
    trait_name: str | None = Query(None),
    value: str | None = Query(None),
    limit: int = Query(100, le=1000),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """List training samples with optional filtering."""
    q = db.query(TrainingSample)
    if trait_name is not None:
        q = q.filter(TrainingSample.trait_name == trait_name)
    if value is not None:
        q = q.filter(TrainingSample.value == value)
    q = q.order_by(TrainingSample.labeled_at.desc())
    return q.offset(offset).limit(limit).all()


@router.get("/samples/stats", response_model=TrainingSampleStats)
def training_sample_stats(
    trait_name: str | None = Query(None),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Get summary statistics of collected training data."""
    q = db.query(TrainingSample)
    if trait_name:
        q = q.filter(TrainingSample.trait_name == trait_name)

    total = q.count()

    value_rows = (
        q.with_entities(TrainingSample.value, func.count(TrainingSample.id))
        .group_by(TrainingSample.value)
        .all()
    )
    by_value = {val: cnt for val, cnt in value_rows}

    trait_rows = (
        q.with_entities(TrainingSample.trait_name, func.count(TrainingSample.id))
        .group_by(TrainingSample.trait_name)
        .all()
    )
    by_trait = {tn: cnt for tn, cnt in trait_rows}

    source_rows = (
        q.with_entities(TrainingSample.source, func.count(TrainingSample.id))
        .group_by(TrainingSample.source)
        .all()
    )
    by_source = {src: cnt for src, cnt in source_rows}

    return TrainingSampleStats(total=total, by_value=by_value, by_trait=by_trait, by_source=by_source)


@router.get("/review-queue", response_model=list[ReviewQueueItem])
def get_review_queue(
    trait_name: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get images where AI prediction was overridden by the user (admin only)."""
    q = (
        db.query(TrainingSample)
        .options(joinedload(TrainingSample.image))
        .filter(TrainingSample.source == "user_corrected")
    )
    if trait_name:
        q = q.filter(TrainingSample.trait_name == trait_name)
    q = q.order_by(TrainingSample.labeled_at.desc())
    samples = q.offset(offset).limit(limit).all()

    results = []
    for s in samples:
        results.append(ReviewQueueItem(
            id=s.id,
            image_id=s.image_id,
            trait_name=s.trait_name,
            value=s.value,
            ai_predicted_value=s.ai_predicted_value,
            ai_confidence=s.ai_confidence,
            source=s.source,
            labeled_at=s.labeled_at,
            image_filename=s.image.filename,
            plot_id=s.image.plot_id,
        ))
    return results


@router.get("/export")
def export_training_data(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Export training data as CSV with image paths for the training pipeline."""
    samples = (
        db.query(TrainingSample)
        .options(joinedload(TrainingSample.image))
        .order_by(TrainingSample.trait_name, TrainingSample.value, TrainingSample.id)
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["sample_id", "image_id", "filename", "trait_name", "value", "source", "labeled_at"])
    for s in samples:
        writer.writerow([s.id, s.image_id, s.image.filename, s.trait_name, s.value, s.source, s.labeled_at.isoformat()])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=training_samples.csv"},
    )


# ─── Training Jobs ────────────────────────────────────────────────────────────

@router.post("/jobs", response_model=TrainingJobResponse, status_code=201)
async def create_training_job(body: TrainingJobCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Create a training job and dispatch to RunPod (or local runner as fallback)."""
    # Check for already running/queued job for this (crop, trait)
    active = db.query(TrainingJob).filter(
        TrainingJob.crop == body.crop,
        TrainingJob.trait_name == body.trait_name,
        TrainingJob.status.in_(["queued", "running"]),
    ).first()
    if active:
        raise HTTPException(409, f"A {active.status} job already exists for {body.crop}/{body.trait_name}")

    # Get trait metadata
    trait = db.query(Trait).filter(Trait.name == body.trait_name).first()
    classes = json.loads(trait.categories) if trait and trait.categories else [str(i) for i in range(1, 6)]
    class_labels = json.loads(trait.category_labels) if trait and trait.category_labels else None

    # Count available samples
    sample_count = db.query(TrainingSample).filter(
        TrainingSample.crop == body.crop,
        TrainingSample.trait_name == body.trait_name,
    ).count()

    job = TrainingJob(
        trait_name=body.trait_name,
        crop=body.crop,
        status="queued",
        config=json.dumps(body.config) if body.config else None,
        sample_count=sample_count,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Try dispatching to RunPod if configured
    if settings.RUNPOD_ENDPOINT_ID and settings.RUNPOD_API_KEY:
        try:
            from services.training_data import prepare_training_manifest, upload_training_manifest
            from services.runpod_client import trigger_training

            manifest = prepare_training_manifest(db, body.crop, body.trait_name, classes, class_labels)
            manifest_url = upload_training_manifest(manifest, body.crop, body.trait_name)

            callback_url = f"{settings.RAILWAY_PUBLIC_URL}/training/jobs/{job.id}/complete"
            runpod_job_id = await trigger_training(
                job_id=job.id, crop=body.crop, trait_name=body.trait_name,
                training_manifest_url=manifest_url, callback_url=callback_url,
                config=body.config,
            )

            job.runpod_job_id = runpod_job_id
            job.status = "running"
            job.started_at = datetime.utcnow()
            db.commit()
            db.refresh(job)
            logger.info("Training job %d dispatched to RunPod: %s", job.id, runpod_job_id)
        except Exception as e:
            logger.error("Failed to dispatch to RunPod: %s", e)
            job.status = "failed"
            job.error_message = f"Failed to dispatch to RunPod: {e}"
            db.commit()
            db.refresh(job)
    else:
        # Fallback: leave as queued for local training runner (dev mode)
        logger.info("RunPod not configured, job %d left as queued for local runner", job.id)

    return job


@router.post("/jobs/{job_id}/complete")
def training_job_complete(job_id: int, body: TrainingJobCompleteCallback, db: Session = Depends(get_db)):
    """Callback endpoint for RunPod worker when training finishes."""
    # Verify callback secret
    if body.secret != settings.TRAINING_CALLBACK_SECRET:
        raise HTTPException(403, "Invalid callback secret")

    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Training job not found")

    if body.success:
        job.status = "completed"
        job.metrics = json.dumps(body.metrics) if body.metrics else None
        job.model_url = body.model_url
        job.completed_at = datetime.utcnow()

        # Update manifest.json in Supabase Storage
        try:
            from services.manifest import update_manifest
            update_manifest(job.crop, job.trait_name, body.model_url, body.metrics or {})
        except Exception as e:
            logger.error("Failed to update manifest: %s", e)
    else:
        job.status = "failed"
        job.error_message = body.error_message
        job.completed_at = datetime.utcnow()

    db.commit()
    logger.info("Training job %d callback: %s", job_id, job.status)
    return {"success": True}


@router.get("/jobs/{job_id}/poll")
async def poll_training_job(job_id: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Poll RunPod for job status (fallback if webhook doesn't fire)."""
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Training job not found")
    if not job.runpod_job_id:
        return {"status": job.status, "runpod_status": None}

    try:
        from services.runpod_client import check_job_status
        runpod_status = await check_job_status(job.runpod_job_id)
        return {"status": job.status, "runpod_status": runpod_status}
    except Exception as e:
        return {"status": job.status, "runpod_status": None, "error": str(e)}


@router.get("/jobs", response_model=list[TrainingJobResponse])
def list_training_jobs(
    trait_name: str | None = Query(None),
    limit: int = Query(20, le=100),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """List training jobs, most recent first."""
    q = db.query(TrainingJob)
    if trait_name:
        q = q.filter(TrainingJob.trait_name == trait_name)
    return q.order_by(TrainingJob.created_at.desc()).limit(limit).all()


@router.get("/jobs/{job_id}", response_model=TrainingJobResponse)
def get_training_job(job_id: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Get a specific training job."""
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Training job not found")
    return job


@router.post("/jobs/{job_id}/cancel", response_model=TrainingJobResponse)
def cancel_training_job(job_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Cancel a queued or running training job."""
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Training job not found")
    if job.status not in ("queued", "running"):
        raise HTTPException(400, f"Cannot cancel job with status '{job.status}'")
    job.status = "cancelled"
    db.commit()
    db.refresh(job)
    return job


# ─── Reference Images ─────────────────────────────────────────────────────────

@router.get("/reference-images/{trait_name}")
def list_reference_images(trait_name: str, user: User = Depends(require_user)):
    """List reference images for a trait."""
    trait_dir = REFERENCE_DIR / trait_name
    if not trait_dir.exists():
        return []
    images = []
    for f in sorted(trait_dir.iterdir()):
        if f.suffix.lower() in (".jpg", ".jpeg", ".png"):
            # Parse value from filename: severity_N_X.ext or value_X.ext
            parts = f.stem.split("_")
            value = parts[1] if len(parts) >= 2 else f.stem
            images.append({
                "filename": f.name,
                "value": value,
                "path": f"reference_images/{trait_name}/{f.name}",
            })
    return images


@router.post("/reference-images/{trait_name}/{value}")
async def upload_reference_image(trait_name: str, value: str, file: UploadFile = File(...), admin: User = Depends(require_admin)):
    """Upload a reference image for a specific trait value."""
    trait_dir = REFERENCE_DIR / trait_name
    trait_dir.mkdir(parents=True, exist_ok=True)

    # Count existing images for this value to generate suffix
    existing = [f for f in trait_dir.iterdir() if f.stem.startswith(f"severity_{value}_") or f.stem.startswith(f"{value}_")]
    suffix = chr(ord('a') + len(existing))
    ext = Path(file.filename).suffix.lower() if file.filename else ".jpg"
    new_name = f"severity_{value}_{suffix}{ext}"

    dest = trait_dir / new_name
    with open(dest, "wb") as f:
        content = await file.read()
        f.write(content)

    return {"filename": new_name, "value": value, "path": f"reference_images/{trait_name}/{new_name}"}


@router.delete("/reference-images/{trait_name}/{filename}")
def delete_reference_image(trait_name: str, filename: str, admin: User = Depends(require_admin)):
    """Delete a reference image."""
    file_path = REFERENCE_DIR / trait_name / filename
    if not file_path.exists():
        raise HTTPException(404, "Reference image not found")
    file_path.unlink()
    return {"success": True}
