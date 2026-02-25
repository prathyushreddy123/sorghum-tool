"""Training data collection endpoints for model improvement."""
import csv
import io
import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Image, TrainingSample
from schemas import TrainingSampleCreate, TrainingSampleResponse, TrainingSampleStats

router = APIRouter(prefix="/training", tags=["training"])


@router.post("/samples", response_model=TrainingSampleResponse, status_code=201)
def create_training_sample(body: TrainingSampleCreate, db: Session = Depends(get_db)):
    """Submit a labeled training sample (image + severity)."""
    # Verify image exists
    image = db.query(Image).filter(Image.id == body.image_id).first()
    if not image:
        raise HTTPException(404, "Image not found")

    # Upsert: update severity if same image already exists
    existing = db.query(TrainingSample).filter(
        TrainingSample.image_id == body.image_id,
    ).first()
    if existing:
        existing.severity = body.severity
        existing.source = body.source
        db.commit()
        db.refresh(existing)
        return existing

    sample = TrainingSample(
        image_id=body.image_id,
        severity=body.severity,
        source=body.source,
    )
    db.add(sample)
    db.commit()
    db.refresh(sample)
    return sample


@router.get("/samples", response_model=list[TrainingSampleResponse])
def list_training_samples(
    severity: int | None = Query(None, ge=1, le=5),
    limit: int = Query(100, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List training samples with optional filtering."""
    q = db.query(TrainingSample)
    if severity is not None:
        q = q.filter(TrainingSample.severity == severity)
    q = q.order_by(TrainingSample.labeled_at.desc())
    return q.offset(offset).limit(limit).all()


@router.get("/samples/stats", response_model=TrainingSampleStats)
def training_sample_stats(db: Session = Depends(get_db)):
    """Get summary statistics of collected training data."""
    total = db.query(func.count(TrainingSample.id)).scalar() or 0

    severity_rows = (
        db.query(TrainingSample.severity, func.count(TrainingSample.id))
        .group_by(TrainingSample.severity)
        .all()
    )
    by_severity = {str(sev): cnt for sev, cnt in severity_rows}

    source_rows = (
        db.query(TrainingSample.source, func.count(TrainingSample.id))
        .group_by(TrainingSample.source)
        .all()
    )
    by_source = {src: cnt for src, cnt in source_rows}

    return TrainingSampleStats(total=total, by_severity=by_severity, by_source=by_source)


@router.get("/export")
def export_training_data(db: Session = Depends(get_db)):
    """Export training data as CSV with image paths for the training pipeline."""
    samples = (
        db.query(TrainingSample)
        .options(joinedload(TrainingSample.image))
        .order_by(TrainingSample.severity, TrainingSample.id)
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["sample_id", "image_id", "filename", "severity", "source", "labeled_at"])
    for s in samples:
        writer.writerow([s.id, s.image_id, s.image.filename, s.severity, s.source, s.labeled_at.isoformat()])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=training_samples.csv"},
    )
