"""
Core training functions for MobileNetV3 fine-tuning.
Extracted from scripts/train_model.py to run in RunPod serverless containers.
"""
import json
import os
from collections import Counter
from pathlib import Path

import httpx
import numpy as np
import onnx
import onnxruntime as ort
import torch
import torch.nn as nn
import torch.optim as optim
from PIL import Image
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import models, transforms

INPUT_SIZE = 224
BATCH_SIZE = 16
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


class TraitDataset(Dataset):
    """Dataset of (image_path, class_label) pairs."""

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


def build_transforms(train: bool = True):
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
    for param in model.parameters():
        param.requires_grad = False
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


def train_model(model, train_loader, val_loader, device,
                epochs_frozen=10, epochs_unfrozen=20, lr=1e-3) -> float:
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


def export_to_onnx(model, output_path: str, quantize: bool = True):
    """Export PyTorch model to ONNX, optionally with INT8 quantization."""
    model.eval()
    model.cpu()
    dummy = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE)

    fp32_path = output_path if not quantize else output_path.replace(".onnx", "_fp32.onnx")

    torch.onnx.export(
        model, dummy, fp32_path,
        input_names=["input"], output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
        opset_version=18, dynamo=False,
    )
    print(f"Exported FP32 ONNX model to {fp32_path}")

    if quantize:
        from onnxruntime.quantization import QuantType, quantize_dynamic
        quantize_dynamic(fp32_path, output_path, weight_type=QuantType.QUInt8)
        if os.path.exists(fp32_path) and fp32_path != output_path:
            os.remove(fp32_path)
        print(f"Quantized INT8 ONNX model saved to {output_path}")

    # Verify
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)
    session = ort.InferenceSession(output_path)
    test_input = np.random.randn(1, 3, INPUT_SIZE, INPUT_SIZE).astype(np.float32)
    result = session.run(None, {session.get_inputs()[0].name: test_input})
    print(f"Verification: output shape = {result[0].shape}, "
          f"model size = {os.path.getsize(output_path) / 1024 / 1024:.1f}MB")


def download_training_images(manifest: dict, output_dir: str) -> list[tuple[str, int]]:
    """Download images from Supabase URLs to local dir, organized by class.

    Returns list of (local_path, class_index) tuples.
    """
    samples = []
    classes = manifest["classes"]
    class_to_idx = {c: i for i, c in enumerate(classes)}

    os.makedirs(output_dir, exist_ok=True)
    for cls in classes:
        os.makedirs(os.path.join(output_dir, cls), exist_ok=True)

    with httpx.Client(timeout=30.0) as client:
        all_items = manifest.get("samples", []) + manifest.get("reference_images", [])
        for i, item in enumerate(all_items):
            url = item["url"]
            cls = item["class"]
            if cls not in class_to_idx:
                continue
            ext = Path(url).suffix or ".jpg"
            local_path = os.path.join(output_dir, cls, f"img_{i:05d}{ext}")
            try:
                resp = client.get(url)
                resp.raise_for_status()
                with open(local_path, "wb") as f:
                    f.write(resp.content)
                samples.append((local_path, class_to_idx[cls]))
            except Exception as e:
                print(f"Warning: failed to download {url}: {e}")

    return samples


def run_training(
    manifest: dict,
    output_path: str,
    config: dict | None = None,
    augment_factor: int = 50,
) -> dict:
    """Full training pipeline: download → train → export → return metrics.

    Args:
        manifest: Training data manifest with classes, samples, reference_images
        output_path: Where to save the ONNX model locally
        config: Optional training config overrides
        augment_factor: Multiplier for reference images (bootstrap augmentation)

    Returns:
        Metrics dict with accuracy, confusion matrix, etc.
    """
    config = config or {}
    epochs_frozen = config.get("epochs_frozen", 10)
    epochs_unfrozen = config.get("epochs_unfrozen", 20)
    lr = config.get("lr", 1e-3)
    no_quantize = config.get("no_quantize", False)

    classes = manifest["classes"]
    num_classes = len(classes)
    print(f"Training for {manifest.get('crop', '?')}/{manifest.get('trait', '?')} "
          f"with {num_classes} classes: {classes}")

    # Download images
    tmp_dir = "/tmp/training_images"
    samples = download_training_images(manifest, tmp_dir)
    if not samples:
        raise RuntimeError("No training images downloaded")

    # Separate reference images for bootstrap augmentation
    n_ref = len(manifest.get("reference_images", []))
    n_user = len(manifest.get("samples", []))
    if n_ref > 0 and n_user == 0:
        # Bootstrap only: multiply reference samples
        samples = samples * augment_factor
        print(f"Bootstrap mode: {n_ref} ref images × {augment_factor} = {len(samples)} samples")
    elif n_ref > 0:
        # Hybrid: augment reference images less
        ref_samples = samples[:n_ref]
        user_samples = samples[n_ref:]
        samples = user_samples + ref_samples * min(augment_factor, 10)
        print(f"Hybrid mode: {n_user} user + {n_ref}×{min(augment_factor, 10)} ref = {len(samples)} samples")

    dist = Counter(label for _, label in samples)
    print(f"Class distribution: {dict(sorted((classes[k], v) for k, v in dist.items()))}")

    # Weighted sampler for class imbalance
    class_counts = [dist.get(i, 1) for i in range(num_classes)]
    weights = [1.0 / class_counts[label] for _, label in samples]
    sampler = WeightedRandomSampler(weights, len(samples), replacement=True)

    # Train/val split
    train_samples, val_samples = train_test_split(
        samples, test_size=0.1, stratify=[l for _, l in samples], random_state=42
    )

    train_dataset = TraitDataset(train_samples, transform=build_transforms(train=True))
    val_dataset = TraitDataset(val_samples, transform=build_transforms(train=False))

    train_dist = Counter(label for _, label in train_samples)
    train_class_counts = [train_dist.get(i, 1) for i in range(num_classes)]
    train_weights = [1.0 / train_class_counts[label] for _, label in train_samples]
    train_sampler = WeightedRandomSampler(train_weights, len(train_samples), replacement=True)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, sampler=train_sampler, num_workers=2)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)

    # Build and train
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    model = build_model(num_classes).to(device)
    best_val_acc = train_model(
        model, train_loader, val_loader, device,
        epochs_frozen=epochs_frozen, epochs_unfrozen=epochs_unfrozen, lr=lr,
    )

    # Compute final metrics
    confusion = compute_confusion_matrix(model, val_loader, device, num_classes)
    final_val_acc = evaluate(model, val_loader, device)

    # Export
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    export_to_onnx(model, output_path, quantize=not no_quantize)

    metrics = {
        "num_classes": num_classes,
        "classes": classes,
        "class_labels": manifest.get("class_labels"),
        "total_samples": len(samples),
        "train_samples": len(train_samples),
        "val_samples": len(val_samples),
        "val_accuracy": round(final_val_acc, 4),
        "best_val_accuracy": round(best_val_acc, 4),
        "confusion_matrix": confusion,
        "class_distribution": {classes[k]: v for k, v in sorted(dist.items())},
        "model_size_mb": round(os.path.getsize(output_path) / 1024 / 1024, 1),
    }

    print(f"\nTraining complete! Val accuracy: {100*final_val_acc:.1f}%")
    return metrics
