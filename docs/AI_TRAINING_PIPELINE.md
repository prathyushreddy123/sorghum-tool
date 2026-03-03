# AI Training Pipeline — SorghumField

## Overview

SorghumField uses a **3-tier AI classification system** that runs entirely in the browser for offline-capable disease scoring. This document covers how models are trained, exported, and deployed.

## Architecture

```
Tier 1: Fine-tuned ONNX (MobileNetV3-Large) — runs in-browser via ONNX Runtime Web
Tier 2: CLIP zero-shot (MobileCLIP-S0) — in-browser fallback, no training needed
Tier 3: Cloud LLM (Gemini 2.5 Flash / Groq Llama 4 Scout) — API fallback
```

When a user takes a photo, the app tries Tier 1 first. If the confidence is below the threshold (default 60%), it falls back to Tier 2, then Tier 3.

## Models

### Disease Identification (`sorghum_disease_type`)
- **Task:** Classify which disease is present (6 classes)
- **Classes:** Anthracnose & Red Rot, Cereal Grain Molds, Covered Kernel Smut, Head Smut, Rust, Loose Smut
- **Accuracy:** 99.2% validation
- **Training data:** 7,167 images from Mendeley Sorghum Disease Dataset
- **Labels:** Folder names (ground truth from dataset)

### Severity Classification (`disease_severity_general`)
- **Task:** Rate disease severity on a 1–5 scale
- **Classes:** 1 (None, 0%), 2 (Low, 1-10%), 3 (Moderate, 11-25%), 4 (High, 26-50%), 5 (Severe, >50%)
- **Training data:** 6,178 images auto-labeled by Gemini 2.5 Flash via Vertex AI
- **Labels:** AI-generated severity scores (cached in `labeled_severity.json`)

## Training Pipeline

### Prerequisites

```bash
# In backend/ directory
pip install torch torchvision onnx onnxruntime google-genai Pillow numpy

# For Vertex AI labeling (uses GCP credits, higher rate limits)
gcloud auth application-default login
```

### Step 1: Auto-label Severity with Gemini

```bash
cd backend

# Using Vertex AI (recommended — higher rate limits, uses GCP $300 free credits)
python scripts/train_disease_models.py label \
  --dataset-dir "/path/to/Sorghum Disease Image Dataset" \
  --vertex

# Using Google AI Studio (free tier, slower due to rate limits)
python scripts/train_disease_models.py label \
  --dataset-dir "/path/to/Sorghum Disease Image Dataset"

# Custom severity scale (e.g., 1-9 ICRISAT scale)
python scripts/train_disease_models.py label \
  --dataset-dir "/path/to/dataset" \
  --vertex \
  --classes "1,3,5,7,9" \
  --class-labels "Immune,Resistant,Tolerant,Susceptible,Highly Susceptible"
```

**How it works:**
- Sends each image to Gemini 2.5 Flash with the disease name and severity scale
- Gemini returns a severity score (e.g., "4")
- Results are cached to `backend/scripts/labeled_severity.json`
- Resumable — skips already-labeled images on restart
- Processes in batches of 50 with 3 concurrent requests (Vertex AI)
- Includes retry logic with exponential backoff for 429 rate limits

**Output:** `labeled_severity.json` — maps image paths to `{severity, disease}`:
```json
{
  "/path/to/image.jpg": {"severity": 4, "disease": "Rust"}
}
```

### Step 2: Train Disease Identification Model

```bash
python scripts/train_disease_models.py train-id \
  --dataset-dir "/path/to/Sorghum Disease Image Dataset"
```

**How it works:**
- Uses folder names as class labels (no Gemini labeling needed)
- 90/10 train/val split with weighted random sampling for class balance
- MobileNetV3-Large with ImageNet pretrained weights
- Phase 1 (10 epochs): Train classifier head only, lr=1e-3
- Phase 2 (20 epochs): Unfreeze top 30 layers, lr=1e-4, cosine annealing
- Exports to ONNX (INT8 quantized, falls back to FP32 if quantization fails)
- Updates `frontend/public/models/manifest.json`

**Data augmentation:** RandomResizedCrop, horizontal/vertical flip, rotation (30°), color jitter, affine transforms, grayscale (10%), random erasing (20%)

### Step 3: Train Severity Model

```bash
# Combined model for all diseases
python scripts/train_disease_models.py train-severity \
  --dataset-dir "/path/to/Sorghum Disease Image Dataset"

# Per-disease model (if enough data)
python scripts/train_disease_models.py train-severity \
  --dataset-dir "/path/to/dataset" \
  --disease "Cereal Grain molds" \
  --trait grain_mold_severity
```

**How it works:**
- Reads severity labels from `labeled_severity.json` (Step 1 output)
- Same 2-phase training as disease ID
- `WeightedRandomSampler` handles class imbalance (severity 5 is overrepresented)
- Outputs ONNX model + updates manifest

### Step 4: Upload to Supabase (Production)

```bash
python scripts/train_disease_models.py upload
```

**How it works:**
- Uploads all `.onnx` files from `frontend/public/models/` to Supabase `models` bucket
- Uploads `manifest.json` with URLs updated to Supabase CDN paths
- Frontend fetches manifest on load and downloads models for in-browser inference

## Model Architecture

```
MobileNetV3-Large (ImageNet pretrained)
├── Features (frozen in Phase 1, top 30 unfrozen in Phase 2)
└── Classifier (custom head):
    ├── Linear(960, 256)
    ├── Hardswish()
    ├── Dropout(0.2)
    └── Linear(256, num_classes)
```

- **Input:** 224×224 RGB image, normalized with ImageNet mean/std
- **Output:** Softmax probabilities over classes
- **Export:** ONNX opset 17, FP32 (~0.3 MB per model)
- **Inference:** ONNX Runtime Web (browser), ~50ms on modern phones

## Dataset

**Mendeley Sorghum Disease Image Dataset** (7,167 images)

| Disease | Images | Source |
|---------|--------|--------|
| Rust | 2,379 | Mendeley |
| Cereal Grain Molds | 1,220 | Mendeley |
| Anthracnose & Red Rot | 1,013 | Mendeley |
| Loose Smut | 1,777 | Mendeley |
| Head Smut | 499 | Mendeley |
| Covered Kernel Smut | 279 | Mendeley |

## Bulk Dataset Import

For importing additional datasets (e.g., PlantVillage) into Supabase for cloud-based training:

```bash
python scripts/bulk_import_dataset.py \
  --source-dir ~/datasets/mendeley-sorghum \
  --crop sorghum \
  --trait grain_mold_severity \
  --class-map "Cereal Grain Molds=3,Head Smut=4,Healthy=1" \
  --limit-per-class 500 \
  --dry-run  # preview first
```

Uploads to Supabase `training-images` bucket at path: `{crop}/{trait_name}/{class_value}/{filename}`

## File Structure

```
backend/
├── scripts/
│   ├── train_disease_models.py   # Main training pipeline (label, train-id, train-severity, upload)
│   ├── bulk_import_dataset.py    # Bulk dataset import to Supabase
│   └── labeled_severity.json     # Cached Gemini severity labels (generated)
├── runpod_training/
│   ├── Dockerfile                # GPU training container for RunPod Serverless
│   ├── handler.py                # RunPod serverless handler
│   └── train_logic.py            # Training logic (shared with local)
frontend/
├── public/models/
│   ├── manifest.json             # Model registry (URLs, classes, accuracy)
│   ├── sorghum_disease_type.onnx # Disease identification model
│   ├── disease_severity_general.onnx  # Severity classification model
│   └── mobileclip-s0-vision.onnx # CLIP model for Tier 2 fallback
├── src/
│   ├── ai/
│   │   ├── AIClassifier.ts       # 3-tier classification orchestrator
│   │   ├── onnxClassifier.ts     # Tier 1: ONNX inference
│   │   └── clipClassifier.ts     # Tier 2: CLIP zero-shot
```

## RunPod (Cloud GPU Training)

For production training without a local GPU:

1. Build & push Docker image:
   ```bash
   cd backend/runpod_training
   docker build -t yourusername/sorghum-training:latest .
   docker push yourusername/sorghum-training:latest
   ```

2. Create RunPod Serverless endpoint with the image

3. Set Railway env vars:
   ```
   RUNPOD_ENDPOINT_ID=<your-endpoint-id>
   RUNPOD_API_KEY=<your-api-key>
   TRAINING_CALLBACK_SECRET=<random-secret>
   RAILWAY_PUBLIC_URL=https://your-app.up.railway.app
   ```

4. Training jobs can then be triggered from the admin UI at `/settings/training`

## Custom Scales

The UI (TraitBuilderModal) supports custom severity scales. When creating a categorical trait:
- Select "Category" data type
- Add rows with custom values and labels (e.g., 1=Immune, 3=Resistant, 5=Tolerant, 7=Susceptible, 9=Highly Susceptible)

The training pipeline supports custom scales via `--classes` and `--class-labels` arguments.

## Results Summary (March 3, 2026)

| Model | Task | Training Images | Val Accuracy | Size |
|-------|------|-----------------|-------------|------|
| `sorghum_disease_type` | Disease identification (6 classes) | 7,167 | **99.2%** | 340 KB |
| `grain_mold_severity` | Grain Mold severity 1-5 | 1,220 | **85.2%** | 340 KB |
| `anthracnose_severity` | Anthracnose severity 1-5 | 1,013 | **77.5%** | 340 KB |
| `rust_severity` | Rust severity 1-5 | 2,379 | **67.2%** | 339 KB |
| `disease_severity_general` | Combined severity fallback | 6,178 | **81.7%** | 341 KB |

**Notes:**
- Rust accuracy is lower due to extreme class imbalance (only 25 images for severity 1-2 combined)
- Combined model serves as fallback for diseases without per-disease models (Covered Smut, Head Smut, Loose Smut)
- All models served from Vercel via `frontend/public/models/` — lazy-loaded on first use per trait
- Severity labels were auto-generated by Gemini 2.5 Flash via Vertex AI (6,178/7,167 labeled before quota exhaustion)

## Model-to-Trait Mapping

| Trait | Tier 1 Model | Tier 2 (CLIP) | Tier 3 (Cloud LLM) |
|-------|-------------|---------------|---------------------|
| `sorghum_disease_type` | `sorghum_disease_type.onnx` (99.2%) | - | - |
| `rust_severity` | `rust_severity.onnx` (67.2%) | CLIP zero-shot | Gemini / Groq |
| `grain_mold_severity` | `grain_mold_severity.onnx` (85.2%) | CLIP zero-shot | Gemini / Groq |
| `anthracnose_severity` | `anthracnose_severity.onnx` (77.5%) | CLIP zero-shot | Gemini / Groq |
| `covered_smut_severity` | `disease_severity_general.onnx` (81.7%) | CLIP zero-shot | Gemini / Groq |
| `head_smut_severity` | `disease_severity_general.onnx` (81.7%) | CLIP zero-shot | Gemini / Groq |
| `loose_smut_severity` | `disease_severity_general.onnx` (81.7%) | CLIP zero-shot | Gemini / Groq |
| `ergot_severity` | `ergot-severity-v1.onnx` | CLIP zero-shot | Gemini / Groq |
| `flowering_stage` | None | CLIP zero-shot | Gemini / Groq |
| `compactness_score` | None | CLIP zero-shot | Gemini / Groq |
| `fertility_score` | None | CLIP zero-shot | Gemini / Groq |

## Improving Accuracy

To improve per-disease model accuracy:
1. **More data for underrepresented classes** — Rust severity 1-2 had only 25 images total
2. **Better labels** — Re-label with domain expert ground truth instead of Gemini auto-labels
3. **More training images** — Import PlantVillage, CGIAR datasets via `bulk_import_dataset.py`
4. **Longer training** — Increase `--epochs2` from 20 to 40 for fine-tuning phase
