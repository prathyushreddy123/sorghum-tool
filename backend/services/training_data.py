"""Training data assembly service.

Gathers training images from TrainingSample records and reference images
in Supabase Storage, builds a manifest JSON for the RunPod training worker.
"""
import json
import logging

from sqlalchemy.orm import Session, joinedload

from models import Image, TrainingSample
from services.storage import get_storage, get_supabase_storage

logger = logging.getLogger(__name__)


def prepare_training_manifest(
    db: Session,
    crop: str,
    trait_name: str,
    classes: list[str],
    class_labels: list[str] | None = None,
) -> dict:
    """Build a training data manifest for the RunPod worker.

    Gathers:
    1. User-labeled images from TrainingSample records
    2. Admin-uploaded reference images from Supabase training-images bucket

    Returns a manifest dict ready to upload to Supabase Storage.
    """
    storage = get_storage()

    # 1. Gather user-labeled samples
    samples_data = []
    training_samples = (
        db.query(TrainingSample)
        .options(joinedload(TrainingSample.image))
        .filter(
            TrainingSample.crop == crop,
            TrainingSample.trait_name == trait_name,
        )
        .all()
    )

    for ts in training_samples:
        if not ts.image:
            continue
        image_url = storage.get_url(ts.image.filename)
        samples_data.append({
            "url": image_url,
            "class": ts.value,
            "source": ts.source,
        })

    logger.info("Found %d user-labeled samples for %s/%s", len(samples_data), crop, trait_name)

    # 2. Gather reference images from Supabase training-images bucket
    reference_data = []
    try:
        training_storage = get_supabase_storage("training-images")
        for cls_value in classes:
            prefix = f"{crop}/{trait_name}/{cls_value}"
            files = training_storage.list_files(prefix)
            for filename in files:
                file_path = f"{prefix}/{filename}"
                url = training_storage.get_url(file_path)
                reference_data.append({
                    "url": url,
                    "class": cls_value,
                })
    except RuntimeError:
        # Supabase not configured — try local reference images
        _gather_local_reference_images(crop, trait_name, classes, reference_data)

    logger.info("Found %d reference images for %s/%s", len(reference_data), crop, trait_name)

    manifest = {
        "crop": crop,
        "trait": trait_name,
        "classes": classes,
        "class_labels": class_labels,
        "samples": samples_data,
        "reference_images": reference_data,
    }

    return manifest


def upload_training_manifest(manifest: dict, crop: str, trait_name: str) -> str:
    """Upload training manifest to Supabase Storage. Returns public URL."""
    storage = get_supabase_storage("training-images")
    path = f"{crop}/{trait_name}/training_manifest.json"
    data = json.dumps(manifest, indent=2).encode()
    storage.save(path, data)
    return storage.get_url(path)


def _gather_local_reference_images(
    crop: str, trait_name: str, classes: list[str], reference_data: list[dict]
):
    """Fallback: gather reference images from local filesystem (dev mode)."""
    from pathlib import Path

    ref_dir = Path(__file__).parent.parent / "reference_images" / trait_name
    if not ref_dir.exists():
        return

    storage = get_storage()
    for f in sorted(ref_dir.iterdir()):
        if f.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue
        parts = f.stem.split("_")
        if len(parts) >= 2:
            value = parts[1]
            if value in classes:
                # For local dev, use a file:// URL or the API serving endpoint
                reference_data.append({
                    "url": f"file://{f.absolute()}",
                    "class": value,
                })
