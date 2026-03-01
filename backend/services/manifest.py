"""Manifest management service.

Reads and writes the model manifest.json in Supabase Storage.
The manifest tells the frontend which ONNX models are available
and where to download them.
"""
import json
import logging
from datetime import datetime

from services.storage import get_supabase_storage

logger = logging.getLogger(__name__)

MANIFEST_PATH = "manifest.json"


def get_manifest() -> dict:
    """Download and parse manifest.json from Supabase Storage models bucket."""
    storage = get_supabase_storage("models")
    data = storage.get_bytes(MANIFEST_PATH)
    return json.loads(data)


def update_manifest(
    crop: str,
    trait_name: str,
    model_url: str,
    metrics: dict,
) -> None:
    """Patch manifest.json with a new tier1 model entry after training."""
    storage = get_supabase_storage("models")

    try:
        manifest = get_manifest()
    except Exception:
        logger.warning("manifest.json not found, creating new one")
        manifest = {"version": "", "models": {}}

    models_dict = manifest.get("models", {})

    # Key: bare trait_name for sorghum (backward compat), crop/trait for others
    model_key = trait_name if crop == "sorghum" else f"{crop}/{trait_name}"
    trait_entry = models_dict.get(model_key, {})

    # Preserve existing tier2/tier3 config
    existing_tier1 = trait_entry.get("tier1") or {}

    classes = metrics.get("classes", [])
    class_labels = metrics.get("class_labels") or existing_tier1.get("class_labels")

    trait_entry["tier1"] = {
        "url": model_url,
        "version": f"v1-trained-{datetime.utcnow().strftime('%Y%m%d')}",
        "size_mb": metrics.get("model_size_mb", 0),
        "accuracy": metrics.get("val_accuracy"),
        "classes": classes,
        "class_labels": class_labels,
        "input_size": 224,
        "confidence_threshold": existing_tier1.get("confidence_threshold", 0.70),
    }

    models_dict[model_key] = trait_entry
    manifest["models"] = models_dict
    manifest["version"] = datetime.utcnow().strftime("%Y-%m-%d")

    storage.save(MANIFEST_PATH, json.dumps(manifest, indent=2).encode())
    logger.info("Updated manifest.json for %s/%s", crop, trait_name)
