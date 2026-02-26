#!/usr/bin/env python3
"""
Fine-tune MobileNetV3-Large for trait classification and export to ONNX.

Usage:
  # Bootstrap from reference images only (proof-of-concept):
  python scripts/train_model.py --trait ergot_severity --bootstrap --output ../frontend/public/models/ergot-severity-v1.onnx

  # Train from collected training data:
  python scripts/train_model.py --trait ergot_severity --data-dir ./training_data --output ../frontend/public/models/ergot-severity-v1.onnx

  # Train with metrics output (used by training runner):
  python scripts/train_model.py --trait ergot_severity --bootstrap --output model.onnx --metrics-output metrics.json

Requirements: pip install -r requirements-train.txt
"""
import argparse
import json
import os
import sys
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import models, transforms
from PIL import Image
import onnx
import onnxruntime as ort
import numpy as np

INPUT_SIZE = 224
BATCH_SIZE = 16
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

REFERENCE_DIR = Path(__file__).parent.parent / "reference_images"
MANIFEST_PATH = Path(__file__).parent.parent.parent / "frontend" / "public" / "models" / "manifest.json"


def get_num_classes(trait_name: str) -> int:
    """Determine number of classes from manifest.json or reference images."""
    if MANIFEST_PATH.exists():
        manifest = json.loads(MANIFEST_PATH.read_text())
        model_info = manifest.get("models", {}).get(trait_name, {})
        # Check tier1 classes or tier2_labels
        tier1 = model_info.get("tier1")
        if tier1 and "classes" in tier1:
            return len(tier1["classes"])
        tier2 = model_info.get("tier2_labels")
        if tier2:
            return len(tier2)
    # Fallback: count from reference images
    trait_dir = REFERENCE_DIR / trait_name
    if trait_dir.exists():
        values = set()
        for f in trait_dir.iterdir():
            parts = f.stem.split("_")
            if len(parts) >= 2:
                try:
                    values.add(int(parts[1]))
                except ValueError:
                    pass
        if values:
            return len(values)
    return 5  # default


class TraitDataset(Dataset):
    """Dataset of (image_path, class_label) pairs."""

    def __init__(self, samples: list[tuple[str, int]], transform=None):
        self.samples = samples  # [(path, label_0indexed), ...]
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, label


def get_reference_samples(trait_name: str) -> list[tuple[str, int]]:
    """Load reference images from backend/reference_images/<trait_name>/."""
    samples = []
    trait_dir = REFERENCE_DIR / trait_name
    if not trait_dir.exists():
        print(f"Warning: reference_images/{trait_name}/ not found at {trait_dir}")
        return samples

    for f in sorted(trait_dir.iterdir()):
        if f.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue
        # Parse severity_N_X.ext or <value>_X.ext
        parts = f.stem.split("_")
        if len(parts) >= 2:
            try:
                value = int(parts[1])
                samples.append((str(f), value - 1))  # 0-indexed
            except ValueError:
                continue
    return samples


def get_data_dir_samples(data_dir: str, num_classes: int) -> list[tuple[str, int]]:
    """Load images from a directory organized as data_dir/{1,2,...,N}/*.jpg."""
    samples = []
    data_path = Path(data_dir)
    for cls in range(1, num_classes + 1):
        class_dir = data_path / str(cls)
        if not class_dir.exists():
            continue
        for f in class_dir.iterdir():
            if f.suffix.lower() in (".jpg", ".jpeg", ".png"):
                samples.append((str(f), cls - 1))
    return samples


def build_transforms(train=True):
    """Build image transforms with heavy augmentation for training."""
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
    else:
        return transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(INPUT_SIZE),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ])


def build_model(num_classes: int) -> nn.Module:
    """Build MobileNetV3-Large with frozen base, custom N-class head."""
    model = models.mobilenet_v3_large(weights=models.MobileNet_V3_Large_Weights.DEFAULT)

    # Freeze all base layers
    for param in model.parameters():
        param.requires_grad = False

    # Replace classifier head
    in_features = model.classifier[0].in_features
    model.classifier = nn.Sequential(
        nn.Linear(in_features, 256),
        nn.Hardswish(),
        nn.Dropout(0.3),
        nn.Linear(256, num_classes),
    )

    return model


def unfreeze_top_layers(model: nn.Module, num_layers: int = 30):
    """Unfreeze the top N layers for fine-tuning."""
    params = list(model.features.parameters())
    for param in params[-num_layers:]:
        param.requires_grad = True


def train_model(model, train_loader, val_loader, device, epochs_frozen=10, epochs_unfrozen=20, lr=1e-3):
    """Two-phase training: frozen base then unfreeze top layers."""
    criterion = nn.CrossEntropyLoss()

    # Phase 1: Train classifier head only
    optimizer = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=lr)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs_frozen)

    print(f"\n--- Phase 1: Training head only ({epochs_frozen} epochs) ---")
    for epoch in range(epochs_frozen):
        model.train()
        total_loss, correct, total = 0, 0, 0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            _, predicted = outputs.max(1)
            correct += predicted.eq(labels).sum().item()
            total += labels.size(0)
        scheduler.step()

        val_acc = evaluate(model, val_loader, device) if val_loader else 0
        print(f"  Epoch {epoch+1}/{epochs_frozen} — loss: {total_loss/len(train_loader):.4f}, "
              f"train_acc: {100*correct/total:.1f}%, val_acc: {100*val_acc:.1f}%")

    # Phase 2: Unfreeze top layers and fine-tune
    unfreeze_top_layers(model, num_layers=30)
    optimizer = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=lr * 0.1)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs_unfrozen)

    best_val_acc = 0.0
    print(f"\n--- Phase 2: Fine-tuning top layers ({epochs_unfrozen} epochs) ---")
    for epoch in range(epochs_unfrozen):
        model.train()
        total_loss, correct, total = 0, 0, 0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            _, predicted = outputs.max(1)
            correct += predicted.eq(labels).sum().item()
            total += labels.size(0)
        scheduler.step()

        val_acc = evaluate(model, val_loader, device) if val_loader else 0
        best_val_acc = max(best_val_acc, val_acc)
        print(f"  Epoch {epoch+1}/{epochs_unfrozen} — loss: {total_loss/len(train_loader):.4f}, "
              f"train_acc: {100*correct/total:.1f}%, val_acc: {100*val_acc:.1f}%")

    return best_val_acc


def evaluate(model, loader, device) -> float:
    """Return accuracy on the given loader."""
    model.eval()
    correct, total = 0, 0
    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            _, predicted = outputs.max(1)
            correct += predicted.eq(labels).sum().item()
            total += labels.size(0)
    return correct / total if total > 0 else 0


def compute_confusion_matrix(model, loader, device, num_classes: int) -> list[list[int]]:
    """Compute confusion matrix [true][predicted]."""
    matrix = [[0] * num_classes for _ in range(num_classes)]
    model.eval()
    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            _, predicted = outputs.max(1)
            for t, p in zip(labels.tolist(), predicted.tolist()):
                matrix[t][p] += 1
    return matrix


def export_to_onnx(model, output_path: str, quantize: bool = True):
    """Export PyTorch model to ONNX, optionally with INT8 quantization."""
    model.eval()
    model.cpu()
    dummy = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE)

    fp32_path = output_path if not quantize else output_path.replace(".onnx", "_fp32.onnx")

    torch.onnx.export(
        model,
        dummy,
        fp32_path,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
        opset_version=18,
        dynamo=False,
    )
    print(f"Exported FP32 ONNX model to {fp32_path}")

    if quantize:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        quantize_dynamic(
            fp32_path,
            output_path,
            weight_type=QuantType.QUInt8,
        )
        # Remove FP32 intermediate
        if os.path.exists(fp32_path) and fp32_path != output_path:
            os.remove(fp32_path)
        print(f"Quantized INT8 ONNX model saved to {output_path}")

    # Verify
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)

    session = ort.InferenceSession(output_path)
    test_input = np.random.randn(1, 3, INPUT_SIZE, INPUT_SIZE).astype(np.float32)
    result = session.run(None, {session.get_inputs()[0].name: test_input})
    print(f"Verification: output shape = {result[0].shape}, model size = {os.path.getsize(output_path) / 1024 / 1024:.1f}MB")


def main():
    parser = argparse.ArgumentParser(description="Train trait classifier")
    parser.add_argument("--trait", type=str, default="ergot_severity", help="Trait name (default: ergot_severity)")
    parser.add_argument("--bootstrap", action="store_true", help="Use reference images for training")
    parser.add_argument("--data-dir", type=str, help="Directory with labeled training images (organized as {1,2,...,N}/*.jpg)")
    parser.add_argument("--output", type=str, default=None)
    parser.add_argument("--epochs-frozen", type=int, default=10)
    parser.add_argument("--epochs-unfrozen", type=int, default=20)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--no-quantize", action="store_true", help="Skip INT8 quantization")
    parser.add_argument("--augment-factor", type=int, default=50, help="Augmentation multiplier for bootstrap (default: 50)")
    parser.add_argument("--metrics-output", type=str, default=None, help="Path to write metrics JSON (used by training runner)")
    args = parser.parse_args()

    if args.output is None:
        args.output = f"../frontend/public/models/{args.trait}-v1.onnx"

    if not args.bootstrap and not args.data_dir:
        print("Error: specify --bootstrap, --data-dir, or both")
        sys.exit(1)

    num_classes = get_num_classes(args.trait)
    print(f"Training classifier for trait '{args.trait}' with {num_classes} classes")

    # Collect samples
    samples = []
    if args.bootstrap:
        ref_samples = get_reference_samples(args.trait)
        print(f"Reference images: {len(ref_samples)}")
        # Multiply bootstrap samples to create more training data via augmentation
        samples.extend(ref_samples * args.augment_factor)
    if args.data_dir:
        data_samples = get_data_dir_samples(args.data_dir, num_classes)
        print(f"Training data images: {len(data_samples)}")
        samples.extend(data_samples)

    if not samples:
        print("Error: no training images found")
        sys.exit(1)

    # Class distribution
    from collections import Counter
    dist = Counter(label for _, label in samples)
    print(f"Class distribution: {dict(sorted((k+1, v) for k, v in dist.items()))}")

    # Weighted sampler for class imbalance
    class_counts = [dist.get(i, 1) for i in range(num_classes)]
    weights = [1.0 / class_counts[label] for _, label in samples]
    sampler = WeightedRandomSampler(weights, len(samples), replacement=True)

    # Split into train/val (90/10)
    from sklearn.model_selection import train_test_split
    train_samples, val_samples = train_test_split(samples, test_size=0.1, stratify=[l for _, l in samples], random_state=42)

    train_dataset = TraitDataset(train_samples, transform=build_transforms(train=True))
    val_dataset = TraitDataset(val_samples, transform=build_transforms(train=False))

    # Recalculate sampler weights for train split only
    train_dist = Counter(label for _, label in train_samples)
    train_class_counts = [train_dist.get(i, 1) for i in range(num_classes)]
    train_weights = [1.0 / train_class_counts[label] for _, label in train_samples]
    train_sampler = WeightedRandomSampler(train_weights, len(train_samples), replacement=True)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, sampler=train_sampler, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

    # Build and train
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    model = build_model(num_classes).to(device)
    best_val_acc = train_model(model, train_loader, val_loader, device,
                               epochs_frozen=args.epochs_frozen,
                               epochs_unfrozen=args.epochs_unfrozen,
                               lr=args.lr)

    # Compute confusion matrix on validation set
    confusion = compute_confusion_matrix(model, val_loader, device, num_classes)
    final_val_acc = evaluate(model, val_loader, device)

    # Export
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    export_to_onnx(model, args.output, quantize=not args.no_quantize)
    print(f"\nDone! Model saved to {args.output}")

    # Write metrics JSON if requested
    if args.metrics_output:
        metrics = {
            "trait_name": args.trait,
            "num_classes": num_classes,
            "total_samples": len(samples),
            "train_samples": len(train_samples),
            "val_samples": len(val_samples),
            "val_accuracy": round(final_val_acc, 4),
            "best_val_accuracy": round(best_val_acc, 4),
            "confusion_matrix": confusion,
            "class_distribution": {str(k + 1): v for k, v in sorted(dist.items())},
            "model_path": os.path.abspath(args.output),
            "model_size_mb": round(os.path.getsize(args.output) / 1024 / 1024, 1),
        }
        with open(args.metrics_output, "w") as f:
            json.dump(metrics, f, indent=2)
        print(f"Metrics written to {args.metrics_output}")


if __name__ == "__main__":
    main()
