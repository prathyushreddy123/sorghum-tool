"""Training data collection and job management endpoints."""
import csv
import io
import json
import os
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from auth import require_admin
from database import get_db
from models import Image, TrainingSample, TrainingJob, User
from schemas import (
    TrainingSampleCreate, TrainingSampleResponse, TrainingSampleStats,
    TrainingJobCreate, TrainingJobResponse,
)

router = APIRouter(prefix="/training", tags=["training"])

REFERENCE_DIR = Path(__file__).parent.parent / "reference_images"


# ─── Training Samples ────────────────────────────────────────────────────────

@router.post("/samples", response_model=TrainingSampleResponse, status_code=201)
def create_training_sample(body: TrainingSampleCreate, db: Session = Depends(get_db)):
    """Submit a labeled training sample (image + trait_name + value)."""
    image = db.query(Image).filter(Image.id == body.image_id).first()
    if not image:
        raise HTTPException(404, "Image not found")

    # Upsert: update value if same image+trait already exists
    existing = db.query(TrainingSample).filter(
        TrainingSample.image_id == body.image_id,
        TrainingSample.trait_name == body.trait_name,
    ).first()
    if existing:
        existing.value = body.value
        existing.source = body.source
        db.commit()
        db.refresh(existing)
        return existing

    sample = TrainingSample(
        image_id=body.image_id,
        trait_name=body.trait_name,
        value=body.value,
        source=body.source,
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


@router.get("/export")
def export_training_data(db: Session = Depends(get_db)):
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
def create_training_job(body: TrainingJobCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Queue a new model training job."""
    # Check for already running/queued job for this trait
    active = db.query(TrainingJob).filter(
        TrainingJob.trait_name == body.trait_name,
        TrainingJob.status.in_(["queued", "running"]),
    ).first()
    if active:
        raise HTTPException(409, f"A {active.status} job already exists for trait '{body.trait_name}'")

    # Count available samples
    sample_count = db.query(TrainingSample).filter(
        TrainingSample.trait_name == body.trait_name,
    ).count()

    job = TrainingJob(
        trait_name=body.trait_name,
        status="queued",
        config=json.dumps(body.config) if body.config else None,
        sample_count=sample_count,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/jobs", response_model=list[TrainingJobResponse])
def list_training_jobs(
    trait_name: str | None = Query(None),
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
):
    """List training jobs, most recent first."""
    q = db.query(TrainingJob)
    if trait_name:
        q = q.filter(TrainingJob.trait_name == trait_name)
    return q.order_by(TrainingJob.created_at.desc()).limit(limit).all()


@router.get("/jobs/{job_id}", response_model=TrainingJobResponse)
def get_training_job(job_id: int, db: Session = Depends(get_db)):
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
def list_reference_images(trait_name: str):
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
