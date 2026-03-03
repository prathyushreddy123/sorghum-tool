#!/usr/bin/env python3
"""
End-to-end pipeline: auto-label sorghum disease images with Gemini,
train disease identification + severity models, export ONNX, update manifest.

Usage:
  # Step 1: Auto-label severity with Gemini (creates labeled_severity.json)
  python scripts/train_disease_models.py label \
    --dataset-dir "/mnt/c/Users/prath/OneDrive/Desktop/sorghum-tool/Sorghum Disease Image Dataset"

  # Step 2: Train disease identification model (uses folder names as classes)
  python scripts/train_disease_models.py train-id \
    --dataset-dir "/mnt/c/Users/prath/OneDrive/Desktop/sorghum-tool/Sorghum Disease Image Dataset"

  # Step 3: Train severity model for a specific disease
  python scripts/train_disease_models.py train-severity \
    --dataset-dir "/mnt/c/Users/prath/OneDrive/Desktop/sorghum-tool/Sorghum Disease Image Dataset" \
    --disease "Cereal Grain molds" --trait grain_mold_severity

  # Step 4: Upload models to Supabase + update manifest
  python scripts/train_disease_models.py upload

Requirements: pip install -r requirements-train.txt google-genai
"""
import argparse
import asyncio
import base64
import json
import os
import random
import sys
import time
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import models, transforms
from PIL import Image
import onnx
from onnxruntime.quantization import quantize_dynamic, QuantType
import numpy as np

from config import settings

# ─── Constants ────────────────────────────────────────────────────────────────

INPUT_SIZE = 224
BATCH_SIZE = 16
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

OUTPUT_DIR = Path(__file__).parent.parent.parent / "frontend" / "public" / "models"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"
LABELS_CACHE = Path(__file__).parent / "labeled_severity.json"

# Disease folder → trait name mapping
DISEASE_TRAIT_MAP = {
    "Anthracnose and Red Rot": "anthracnose_severity",
    "Cereal Grain molds": "grain_mold_severity",
    "Covered Kernel smut": "covered_smut_severity",
    "Head Smut": "head_smut_severity",
    "Rust": "rust_severity",
    "loose smut": "loose_smut_severity",
}

SEVERITY_LABELS = {
    "1": "None (0%)",
    "2": "Low (1-10%)",
    "3": "Moderate (11-25%)",
    "4": "High (26-50%)",
    "5": "Severe (>50%)",
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


# ─── Dataset ──────────────────────────────────────────────────────────────────

class ImageDataset(Dataset):
    def __init__(self, samples: list[tuple[str, int]], transform=None):
        self.samples = samples
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, label


# ─── Transforms ───────────────────────────────────────────────────────────────

def build_transforms(train=True):
    if train:
        return transforms.Compose([
            transforms.RandomResizedCrop(INPUT_SIZE, scale=(0.6, 1.0)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomRotation(30),
            transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.3, hue=0.1),
            transforms.RandomAffine(degrees=0, translate=(0.1, 0.1), scale=(0.9, 1.1)),
            transforms.RandomGrayscale(p=0.1),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
            transforms.RandomErasing(p=0.2),
        ])
    return transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(INPUT_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])


# ─── Model ────────────────────────────────────────────────────────────────────

def build_model(num_classes: int) -> nn.Module:
    model = models.mobilenet_v3_large(weights=models.MobileNet_V3_Large_Weights.DEFAULT)
    for param in model.parameters():
        param.requires_grad = False
    in_features = model.classifier[0].in_features
    model.classifier = nn.Sequential(
        nn.Linear(in_features, 256),
        nn.Hardswish(),
        nn.Dropout(0.2),
        nn.Linear(256, num_classes),
    )
    return model


def unfreeze_top_layers(model: nn.Module, n: int = 30):
    params = list(model.parameters())
    for p in params[-n:]:
        p.requires_grad = True


# ─── Training ─────────────────────────────────────────────────────────────────

def train_model(
    model: nn.Module,
    train_loader: DataLoader,
    val_loader: DataLoader,
    device: torch.device,
    phase1_epochs: int = 10,
    phase2_epochs: int = 20,
) -> dict:
    model.to(device)
    criterion = nn.CrossEntropyLoss()

    # Phase 1: train head only
    print(f"\n── Phase 1: Head only ({phase1_epochs} epochs) ──")
    optimizer = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=1e-3)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=phase1_epochs)
    best_acc = 0.0

    for epoch in range(phase1_epochs):
        model.train()
        running_loss = 0.0
        correct = total = 0
        for imgs, labels in train_loader:
            imgs, labels = imgs.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(imgs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item()
            _, predicted = outputs.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()
        scheduler.step()
        train_acc = correct / total
        val_acc = evaluate(model, val_loader, device)
        best_acc = max(best_acc, val_acc)
        print(f"  Epoch {epoch+1}/{phase1_epochs} — loss: {running_loss/len(train_loader):.3f}, train_acc: {train_acc:.3f}, val_acc: {val_acc:.3f}")

    # Phase 2: unfreeze top layers
    print(f"\n── Phase 2: Fine-tune top layers ({phase2_epochs} epochs) ──")
    unfreeze_top_layers(model, 30)
    optimizer = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=phase2_epochs)

    for epoch in range(phase2_epochs):
        model.train()
        running_loss = 0.0
        correct = total = 0
        for imgs, labels in train_loader:
            imgs, labels = imgs.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(imgs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item()
            _, predicted = outputs.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()
        scheduler.step()
        train_acc = correct / total
        val_acc = evaluate(model, val_loader, device)
        best_acc = max(best_acc, val_acc)
        print(f"  Epoch {epoch+1}/{phase2_epochs} — loss: {running_loss/len(train_loader):.3f}, train_acc: {train_acc:.3f}, val_acc: {val_acc:.3f}")

    return {"best_val_accuracy": best_acc, "final_val_accuracy": val_acc}


def evaluate(model: nn.Module, loader: DataLoader, device: torch.device) -> float:
    model.eval()
    correct = total = 0
    with torch.no_grad():
        for imgs, labels in loader:
            imgs, labels = imgs.to(device), labels.to(device)
            outputs = model(imgs)
            _, predicted = outputs.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()
    return correct / total if total > 0 else 0.0


# ─── ONNX Export ──────────────────────────────────────────────────────────────

def export_onnx(model: nn.Module, output_path: Path, quantize: bool = True):
    model.eval().cpu()
    dummy = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE)
    fp32_path = output_path.with_suffix(".fp32.onnx")

    torch.onnx.export(
        model, dummy, str(fp32_path),
        input_names=["input"], output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
        opset_version=17,
    )

    if quantize:
        try:
            quantize_dynamic(str(fp32_path), str(output_path), weight_type=QuantType.QUInt8)
            fp32_path.unlink()
            print(f"  Exported INT8 ONNX: {output_path} ({output_path.stat().st_size / 1024 / 1024:.1f} MB)")
        except Exception as e:
            print(f"  Quantization failed ({e}), using FP32 instead")
            fp32_path.rename(output_path)
            print(f"  Exported FP32 ONNX: {output_path} ({output_path.stat().st_size / 1024 / 1024:.1f} MB)")
    else:
        fp32_path.rename(output_path)
        print(f"  Exported FP32 ONNX: {output_path} ({output_path.stat().st_size / 1024 / 1024:.1f} MB)")

    onnx.checker.check_model(str(output_path))


# ─── Manifest Update ─────────────────────────────────────────────────────────

def update_local_manifest(trait_name: str, classes: list[str], class_labels: list[str], accuracy: float, onnx_path: Path):
    """Update the local frontend manifest.json with a new tier1 model entry."""
    if MANIFEST_PATH.exists():
        manifest = json.loads(MANIFEST_PATH.read_text())
    else:
        manifest = {"version": "", "models": {}}

    onnx_filename = onnx_path.name
    size_mb = round(onnx_path.stat().st_size / 1024 / 1024, 2)

    entry = manifest.get("models", {}).get(trait_name, {})
    entry["tier1"] = {
        "url": f"/models/{onnx_filename}",
        "version": f"v1-{time.strftime('%Y%m%d')}",
        "size_mb": size_mb,
        "accuracy": round(accuracy, 4),
        "classes": classes,
        "class_labels": class_labels,
        "input_size": INPUT_SIZE,
        "confidence_threshold": 0.60,
    }
    entry["photo_type"] = "panicle"

    manifest["models"][trait_name] = entry
    manifest["version"] = time.strftime("%Y-%m-%d")
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))
    print(f"  Updated manifest.json for {trait_name}")


# ─── Gemini Severity Labeling ────────────────────────────────────────────────

async def label_severity_with_gemini(
    dataset_dir: Path,
    sample_limit: int = 0,
    use_vertex: bool = False,
    classes: list[str] | None = None,
    class_labels: list[str] | None = None,
) -> dict:
    """Use Gemini to estimate severity 1-5 for each image. Returns {filepath: severity}."""
    from google import genai

    if use_vertex:
        # Use Vertex AI with GCP credentials (higher rate limits, uses GCP credits)
        project = os.environ.get("GOOGLE_CLOUD_PROJECT", "sorghum-tool")
        location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
        client = genai.Client(vertexai=True, project=project, location=location)
        print(f"Using Vertex AI (project={project}, location={location})")
    else:
        api_key = settings.GEMINI_API_KEY
        if not api_key:
            print("ERROR: GEMINI_API_KEY not set. Add it to backend/.env")
            sys.exit(1)
        client = genai.Client(api_key=api_key)
        print("Using Google AI Studio (free tier)")

    # Load existing labels if resuming
    labels = {}
    if LABELS_CACHE.exists():
        labels = json.loads(LABELS_CACHE.read_text())
        print(f"Loaded {len(labels)} existing labels from cache")

    # Collect all images
    all_images = []
    for disease_folder in sorted(dataset_dir.iterdir()):
        if not disease_folder.is_dir():
            continue
        disease_name = disease_folder.name
        for f in sorted(disease_folder.iterdir()):
            if f.suffix.lower() in IMAGE_EXTENSIONS:
                key = str(f)
                if key not in labels:
                    all_images.append((f, disease_name))

    if sample_limit > 0:
        random.shuffle(all_images)
        all_images = all_images[:sample_limit]

    args_classes = classes or ["1", "2", "3", "4", "5"]
    args_labels = class_labels or [
        "None (0% affected)", "Low (1-10%)", "Moderate (11-25%)",
        "High (26-50%)", "Severe (>50%)",
    ]

    print(f"Labeling {len(all_images)} images with Gemini ({len(labels)} already cached)...")
    print(f"Scale: {dict(zip(args_classes, args_labels))}")

    scale_desc = "\n".join(
        f"{c} = {l}" for c, l in zip(args_classes, args_labels)
    )
    valid_values = ", ".join(args_classes)
    prompt = f"""You are a plant pathologist. Look at this sorghum disease image and estimate the disease severity using this scale:
{scale_desc}

The disease shown is: {{disease}}

Respond with ONLY one of these values: {valid_values}. Nothing else."""

    concurrency = 3 if use_vertex else 2
    semaphore = asyncio.Semaphore(concurrency)
    batch_size = 50 if use_vertex else 20
    labeled_count = 0

    async def label_one(file_path: Path, disease_name: str):
        nonlocal labeled_count
        async with semaphore:
            try:
                img_bytes = file_path.read_bytes()
                img_b64 = base64.b64encode(img_bytes).decode()
                mime = "image/jpeg" if file_path.suffix.lower() in (".jpg", ".jpeg") else "image/png"

                for attempt in range(3):
                    try:
                        response = await asyncio.wait_for(
                            client.aio.models.generate_content(
                                model="gemini-2.5-flash",
                                contents=[
                                    {"inline_data": {"mime_type": mime, "data": img_b64}},
                                    prompt.format(disease=disease_name),
                                ],
                            ),
                            timeout=60,
                        )
                        break
                    except asyncio.TimeoutError:
                        print(f"  TIMEOUT {file_path.name} (attempt {attempt+1})")
                        if attempt < 2:
                            await asyncio.sleep(15 * (attempt + 1))
                        else:
                            raise
                    except Exception as e:
                        if ("429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)) and attempt < 2:
                            wait = 30 * (attempt + 1)
                            print(f"  Rate limited, waiting {wait}s (attempt {attempt+1})...")
                            await asyncio.sleep(wait)
                        else:
                            raise

                severity = response.text.strip()
                if severity in ("1", "2", "3", "4", "5"):
                    labels[str(file_path)] = {
                        "severity": int(severity),
                        "disease": disease_name,
                    }
                    labeled_count += 1
                else:
                    print(f"  WARNING: Unexpected response for {file_path.name}: '{severity}'")

            except Exception as e:
                print(f"  ERROR {file_path.name}: {e}")

    # Process in batches to save progress periodically
    for i in range(0, len(all_images), batch_size):
        batch = all_images[i:i + batch_size]
        tasks = [label_one(fp, dn) for fp, dn in batch]
        await asyncio.gather(*tasks)

        # Save progress after each batch
        LABELS_CACHE.write_text(json.dumps(labels, indent=2))
        done = min(i + batch_size, len(all_images))
        print(f"  Progress: {done}/{len(all_images)} labeled ({labeled_count} successful)")

    print(f"\nLabeling complete: {len(labels)} total labels")

    # Print distribution
    dist = defaultdict(lambda: defaultdict(int))
    for info in labels.values():
        dist[info["disease"]][info["severity"]] += 1
    for disease, severities in sorted(dist.items()):
        counts = ", ".join(f"sev{k}:{v}" for k, v in sorted(severities.items()))
        print(f"  {disease}: {counts}")

    return labels


# ─── Command: label ───────────────────────────────────────────────────────────

def cmd_label(args):
    dataset_dir = Path(args.dataset_dir)
    if not dataset_dir.exists():
        print(f"ERROR: Dataset directory not found: {dataset_dir}")
        sys.exit(1)

    classes = args.classes.split(",") if args.classes else None
    class_labels = args.class_labels.split(",") if args.class_labels else None
    labels = asyncio.run(label_severity_with_gemini(
        dataset_dir, args.limit, use_vertex=args.vertex,
        classes=classes, class_labels=class_labels,
    ))
    print(f"\nSaved labels to {LABELS_CACHE}")


# ─── Command: train-id ───────────────────────────────────────────────────────

def cmd_train_id(args):
    """Train disease identification model (which disease is it?)."""
    dataset_dir = Path(args.dataset_dir)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # Collect samples: folder name → class index
    classes = sorted([d.name for d in dataset_dir.iterdir() if d.is_dir()])
    class_to_idx = {c: i for i, c in enumerate(classes)}
    print(f"Classes ({len(classes)}): {classes}")

    all_samples = []
    for cls_name in classes:
        cls_dir = dataset_dir / cls_name
        for f in cls_dir.iterdir():
            if f.suffix.lower() in IMAGE_EXTENSIONS:
                all_samples.append((str(f), class_to_idx[cls_name]))

    random.shuffle(all_samples)
    split = int(len(all_samples) * 0.9)
    train_samples, val_samples = all_samples[:split], all_samples[split:]
    print(f"Train: {len(train_samples)}, Val: {len(val_samples)}")

    # Class weights for imbalanced data
    class_counts = defaultdict(int)
    for _, label in train_samples:
        class_counts[label] += 1
    weights = [1.0 / class_counts[label] for _, label in train_samples]
    sampler = WeightedRandomSampler(weights, len(train_samples))

    train_ds = ImageDataset(train_samples, build_transforms(train=True))
    val_ds = ImageDataset(val_samples, build_transforms(train=False))
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, sampler=sampler, num_workers=2, persistent_workers=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2, persistent_workers=True)

    model = build_model(len(classes))
    metrics = train_model(model, train_loader, val_loader, device,
                          phase1_epochs=args.epochs1, phase2_epochs=args.epochs2)

    # Export
    trait_name = "sorghum_disease_type"
    onnx_path = OUTPUT_DIR / f"{trait_name}.onnx"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    export_onnx(model, onnx_path)

    # Slug class names for manifest
    class_slugs = [c.lower().replace(" ", "_") for c in classes]
    update_local_manifest(trait_name, class_slugs, classes, metrics["best_val_accuracy"], onnx_path)

    print(f"\n✓ Disease ID model trained — accuracy: {metrics['best_val_accuracy']:.1%}")
    print(f"  ONNX: {onnx_path}")


# ─── Command: train-severity ─────────────────────────────────────────────────

def cmd_train_severity(args):
    """Train severity model for a specific disease using Gemini labels."""
    dataset_dir = Path(args.dataset_dir)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    if not LABELS_CACHE.exists():
        print(f"ERROR: No severity labels found. Run 'label' command first.")
        print(f"  python scripts/train_disease_models.py label --dataset-dir \"{args.dataset_dir}\"")
        sys.exit(1)

    labels = json.loads(LABELS_CACHE.read_text())

    # Filter to specific disease if requested
    disease_filter = args.disease
    trait_name = args.trait

    if disease_filter:
        filtered = {k: v for k, v in labels.items() if v["disease"] == disease_filter}
        print(f"Filtered to '{disease_filter}': {len(filtered)} images")
    else:
        filtered = labels
        print(f"Using all diseases: {len(filtered)} images")

    if not filtered:
        print("ERROR: No labeled images found for this disease.")
        sys.exit(1)

    # Build samples: severity (1-5) → class index (0-4)
    classes = ["1", "2", "3", "4", "5"]
    all_samples = []
    for path_str, info in filtered.items():
        sev = info["severity"]  # 1-5
        if 1 <= sev <= 5:
            all_samples.append((path_str, sev - 1))  # 0-indexed

    # Print distribution
    dist = defaultdict(int)
    for _, label in all_samples:
        dist[label] += 1
    for i in range(5):
        print(f"  Severity {i+1}: {dist.get(i, 0)} images")

    random.shuffle(all_samples)
    split = int(len(all_samples) * 0.9)
    train_samples, val_samples = all_samples[:split], all_samples[split:]
    print(f"Train: {len(train_samples)}, Val: {len(val_samples)}")

    # Weighted sampler
    class_counts = defaultdict(int)
    for _, label in train_samples:
        class_counts[label] += 1
    weights = [1.0 / max(class_counts[label], 1) for _, label in train_samples]
    sampler = WeightedRandomSampler(weights, len(train_samples))

    train_ds = ImageDataset(train_samples, build_transforms(train=True))
    val_ds = ImageDataset(val_samples, build_transforms(train=False))
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, sampler=sampler, num_workers=2, persistent_workers=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2, persistent_workers=True)

    model = build_model(len(classes))
    metrics = train_model(model, train_loader, val_loader, device,
                          phase1_epochs=args.epochs1, phase2_epochs=args.epochs2)

    # Export
    onnx_path = OUTPUT_DIR / f"{trait_name}.onnx"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    export_onnx(model, onnx_path)

    class_labels = [SEVERITY_LABELS[c] for c in classes]
    update_local_manifest(trait_name, classes, class_labels, metrics["best_val_accuracy"], onnx_path)

    print(f"\n✓ Severity model trained for {trait_name} — accuracy: {metrics['best_val_accuracy']:.1%}")
    print(f"  ONNX: {onnx_path}")


# ─── Command: upload ──────────────────────────────────────────────────────────

def cmd_upload(args):
    """Upload ONNX models + manifest to Supabase models bucket."""
    from services.storage import get_supabase_storage

    storage = get_supabase_storage("models")

    # Upload all .onnx files in the output dir
    onnx_files = list(OUTPUT_DIR.glob("*.onnx"))
    if not onnx_files:
        print("No ONNX files found in", OUTPUT_DIR)
        return

    for onnx_path in onnx_files:
        print(f"Uploading {onnx_path.name}...")
        with open(onnx_path, "rb") as f:
            storage.save(onnx_path.name, f.read())
        url = storage.get_url(onnx_path.name)
        print(f"  → {url}")

    # Upload manifest.json
    if MANIFEST_PATH.exists():
        # Update model URLs to point to Supabase
        manifest = json.loads(MANIFEST_PATH.read_text())
        for trait_name, entry in manifest.get("models", {}).items():
            tier1 = entry.get("tier1")
            if tier1 and tier1["url"].startswith("/models/"):
                filename = tier1["url"].split("/")[-1]
                tier1["url"] = storage.get_url(filename)

        manifest_bytes = json.dumps(manifest, indent=2).encode()
        storage.save("manifest.json", manifest_bytes)
        # Also save locally with updated URLs
        MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))
        print(f"Uploaded manifest.json")

    print("\n✓ All models uploaded to Supabase")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Train sorghum disease models")
    sub = parser.add_subparsers(dest="command", required=True)

    # label
    p_label = sub.add_parser("label", help="Auto-label severity with Gemini")
    p_label.add_argument("--dataset-dir", required=True)
    p_label.add_argument("--limit", type=int, default=0, help="Max images to label (0=all)")
    p_label.add_argument("--vertex", action="store_true", help="Use Vertex AI (GCP credits) instead of AI Studio")
    p_label.add_argument("--classes", help="Comma-separated scale values (default: 1,2,3,4,5)")
    p_label.add_argument("--class-labels", help="Comma-separated scale descriptions (default: None,Low,Moderate,High,Severe)")
    p_label.set_defaults(func=cmd_label)

    # train-id
    p_id = sub.add_parser("train-id", help="Train disease identification model")
    p_id.add_argument("--dataset-dir", required=True)
    p_id.add_argument("--epochs1", type=int, default=10, help="Phase 1 epochs")
    p_id.add_argument("--epochs2", type=int, default=20, help="Phase 2 epochs")
    p_id.set_defaults(func=cmd_train_id)

    # train-severity
    p_sev = sub.add_parser("train-severity", help="Train severity model for a disease")
    p_sev.add_argument("--dataset-dir", required=True)
    p_sev.add_argument("--disease", help="Filter to specific disease folder (e.g., 'Cereal Grain molds')")
    p_sev.add_argument("--trait", default="disease_severity_general", help="Trait name for manifest")
    p_sev.add_argument("--epochs1", type=int, default=10)
    p_sev.add_argument("--epochs2", type=int, default=20)
    p_sev.set_defaults(func=cmd_train_severity)

    # upload
    p_upload = sub.add_parser("upload", help="Upload models to Supabase")
    p_upload.set_defaults(func=cmd_upload)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
