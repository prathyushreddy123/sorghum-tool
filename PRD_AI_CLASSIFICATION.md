# PRD: Multi-Trait AI Classification Architecture

**Version:** 1.0
**Date:** February 25, 2026
**Branch:** `feature/local-ai-classification`
**Status:** Planning

---

## 1. Executive Summary

Architect a scalable, offline-capable AI classification system for SorghumField that supports multiple crops and traits. The system uses a 3-tier inference strategy: fine-tuned ONNX models in-browser (Tier 1), CLIP zero-shot for untrained traits (Tier 2), and RunPod/LLM API fallback (Tier 3). All tiers support offline inference after initial model download.

**Key constraints:**
- ~100MB total model budget on phone (cached via PWA)
- <500ms inference latency on mobile browser
- Fully offline inference after first load
- Scalable to 30-100+ traits across multiple crops
- Training is an admin-only, online-only operation (not offline)

---

## 2. Current State (What Exists)

### Implemented (commit `d4bd6ea`, local branch only)
- In-browser ONNX inference via `onnxruntime-web` (WASM)
- MobileNetV3-Large model for ergot severity (13MB INT8, `ergot-severity-v1.onnx`)
- Hybrid strategy: local (>=70% confidence) -> cloud API fallback
- Cloud fallback: Gemini 2.5 Flash (primary) + Groq Llama 4 Scout
- Backend training pipeline: `backend/scripts/train_model.py` (PyTorch -> ONNX)
- Training data collection: `TrainingSample` model + `/training/samples` endpoint
- PWA caching: ONNX + WASM files cached 30 days via Workbox

### Gaps
- Only ergot severity model exists — no other traits
- No CLIP zero-shot for untrained traits
- No RunPod integration
- No model registry / dynamic model loading
- No training management UI
- `preloadModel()` never called (3-5s first-use delay)
- Hardcoded to single model file path

---

## 3. Target Sorghum Traits & AI Strategy

Starting with sorghum, then expanding to other crops incrementally.

### 3.1 Sorghum Traits — AI vs Manual Decision

| Trait | Data Type | AI Method | Priority | Notes |
|-------|-----------|-----------|----------|-------|
| **Ergot Severity** | Categorical 1-5 | Fine-tuned CNN (EXISTING) | P0 | Already implemented |
| **Plant Height** | Numeric (cm) | AI estimation from photo w/ reference stick (EXISTING) | P0 | Already implemented via Gemini |
| **Flowering Stage (50%)** | Categorical 1-5 → auto-fills date | AI-assisted: plot-level classification | P1 | Photo of whole plot; AI classifies flowering %; if ~50% → auto-record today's date, compute days from sowing |
| **Anthracnose Severity** | Categorical 1-5 | Fine-tuned CNN (leaf photo) | P1 | Similar pipeline to ergot — classify leaf lesion severity |
| **Panicle Length** | Numeric (cm) | AI measurement from photo w/ ruler | P1 | Segmentation + reference object; use LLM tier initially |
| **Plant Count** | Integer | **Manual only** (P0), Object detection (future) | P2 | YOLO-based counting requires separate architecture |
| **Compactness** | Categorical 1-5 | CLIP zero-shot (panicle shape) | P2 | Panicle shape classification — good CLIP candidate |
| **Fertility** | Categorical 1-5 | CLIP zero-shot (seed set %) | P2 | Visual seed set scoring — moderate CLIP candidate |

### 3.2 Flowering Stage — Plot-Level Classification

A plot-level categorical classification to determine when 50% of plants have flowered. The researcher takes a **wide-angle photo of the entire plot** (not a single panicle), and AI estimates the flowering percentage.

| Stage | Score | Visual Cue (what AI looks for) |
|-------|-------|-------------------------------|
| Pre-flowering | 1 | No visible panicles or all still in boot stage |
| Early flowering (<25%) | 2 | Few panicles with extruded anthers, most still green/closed |
| **~50% flowering** | **3** | **Roughly half of panicles show anthesis (yellow anthers visible)** |
| Late flowering (>75%) | 4 | Most panicles have flowered, some anthers drying |
| Fully flowered / grain fill | 5 | All panicles past anthesis, grain development started |

**UX flow:**
1. Researcher visits plot during flowering window
2. Takes a plot-level photo (wide angle, showing multiple plants)
3. AI classifies flowering stage (1-5)
4. If stage = 3 (~50% flowering) → prompt: "Record today as 50% flowering date?"
5. User confirms → today's date saved as `flowering_date`, system computes `days_to_flowering = today - sowing_date`

**AI approach by tier:**
- **Tier 1 (fine-tuned CNN):** Train on labeled plot photos showing different flowering stages. Needs ~100+ labeled plot photos per stage — will require field data collection over a season.
- **Tier 2 (CLIP zero-shot):** Promising initial approach. Text labels describe plot-level appearance (e.g., "sorghum field plot with approximately half of plants showing yellow anthers on panicles, other half still in boot stage"). Good starting point while training data accumulates.
- **Tier 3 (LLM):** Multimodal LLMs (Gemini, Qwen-VL) can estimate flowering percentage from plot photos with reasonable accuracy.

**Key differences from panicle-level traits:**
- Photo is **plot-level** (wide angle) not panicle close-up
- Image type tag: `plot_overview` (new type alongside `panicle` and `full_plant`)
- AI needs to assess the proportion of flowering plants, not a single plant's condition
- Accuracy improves with consistent photo angle/distance (standing at plot edge, facing into plot)

**Training data strategy:**
- Season 1: Use CLIP zero-shot + LLM fallback to bootstrap
- Researchers confirm/correct AI suggestions → labeled data accumulates
- Season 2: Train fine-tuned CNN from accumulated labeled plot photos

---

### 3.3 Anthracnose — Multi-Level AI

Anthracnose is a complex trait requiring multiple AI approaches:

| Sub-Trait | AI Method | Output | Difficulty |
|-----------|-----------|--------|------------|
| Anthracnose leaf severity | Fine-tuned CNN | Categorical 1-5 | Medium |
| Leaf area estimation | Segmentation model (future) | Numeric (cm²) | Hard |
| Lesion segmentation | Segmentation model (future) | Lesion % of leaf | Hard |
| Overall anthracnose score | Manual or CNN | Categorical 1-5 | Medium |

**Phase 1:** Treat anthracnose like ergot — categorical severity from leaf photo using fine-tuned CNN.
**Future:** Add segmentation models for leaf area and lesion quantification.

---

## 4. Architecture

### 4.1 Three-Tier Inference Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER CAPTURES PHOTO                           │
│                         │                                       │
│                         ▼                                       │
│              ┌─────────────────────┐                            │
│              │   Model Registry    │ ← Which model for this     │
│              │   (manifest.json)   │   trait?                   │
│              └────────┬────────────┘                            │
│                       │                                         │
│         ┌─────────────┼──────────────┐                          │
│         ▼             ▼              ▼                           │
│  ┌─────────────┐ ┌──────────┐ ┌──────────────┐                 │
│  │  TIER 1     │ │ TIER 2   │ │   TIER 3     │                 │
│  │ Fine-tuned  │ │ CLIP     │ │ RunPod /     │                 │
│  │ ONNX Model  │ │ Zero-Shot│ │ LLM API      │                 │
│  │             │ │          │ │              │                 │
│  │ 3-13 MB/ea  │ │ ~40 MB   │ │ Server-side  │                 │
│  │ <200ms      │ │ <500ms   │ │ 1-4 seconds  │                 │
│  │ Offline ✓   │ │ Offline ✓│ │ Online only  │                 │
│  │ Highest acc  │ │ Good acc │ │ Best acc     │                 │
│  └──────┬──────┘ └────┬─────┘ └──────┬───────┘                 │
│         │             │              │                          │
│         └──────┬──────┘──────────────┘                          │
│                ▼                                                │
│     ┌─────────────────────────┐                                 │
│     │  Confidence Arbitrator  │                                 │
│     │  - Best result wins     │                                 │
│     │  - Threshold per trait  │                                 │
│     └─────────────────────────┘                                 │
│                │                                                │
│                ▼                                                │
│     ┌─────────────────────────┐                                 │
│     │  Auto-populate trait    │                                 │
│     │  UI shows source +     │                                 │
│     │  confidence badge       │                                 │
│     └─────────────────────────┘                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Tier Details

#### Tier 1: Fine-Tuned ONNX Models (In-Browser)
- **When:** A trained model exists for this specific trait
- **Model:** MobileNetV3-Large, INT8 quantized, 3-13 MB per trait
- **Runtime:** `onnxruntime-web` (WASM), cached via PWA ServiceWorker
- **Latency:** 50-200ms on mobile
- **Accuracy:** 78-88% (with 100+ training images per class)
- **Offline:** Yes, after first download

#### Tier 2: CLIP Zero-Shot (In-Browser)
- **When:** No fine-tuned model exists for this trait, OR Tier 1 confidence < threshold
- **Model:** MobileCLIP-S0 (Apple), INT8 quantized, ~12 MB (shared across ALL traits)
- **How:** Precomputed text embeddings per trait level shipped as JSON (~2KB per trait)
- **Runtime:** `onnxruntime-web` (WASM), same cache strategy
- **Latency:** 200-600ms on mobile
- **Accuracy:** 30-55% zero-shot, 70-82% with linear probe
- **Offline:** Yes, after first download
- **Key advantage:** Works for ANY new categorical trait with zero training — just needs text descriptions of each level

#### Tier 3: Server-Side (Online Fallback)
- **When:** Offline tiers insufficient confidence, OR complex traits (measurement, segmentation)
- **Option A — RunPod Serverless:** Qwen2-VL-7B on 24GB GPU, ~$0.18/240-plot trial
- **Option B — LLM APIs:** Gemini 2.5 Flash (primary) + Groq (fallback) — current system
- **Latency:** 1-4 seconds + network
- **Accuracy:** 80-90% with few-shot prompting
- **Offline:** No

### 4.3 Model Registry (manifest.json)

A JSON manifest served from the backend and cached locally. Drives dynamic model loading.

```json
{
  "version": "2026-02-25",
  "models": {
    "ergot_severity": {
      "tier1": {
        "url": "/models/ergot-severity-v2.onnx",
        "version": "v2",
        "size_mb": 13,
        "accuracy": 0.84,
        "classes": ["1-None", "2-Low", "3-Moderate", "4-High", "5-Severe"],
        "input_size": 224,
        "confidence_threshold": 0.70,
        "trained_at": "2026-02-20"
      },
      "tier2_labels": {
        "1": "sorghum panicle with no ergot, no honeydew, completely clean healthy panicle",
        "2": "sorghum panicle with slight ergot infection, few small honeydew droplets on 1-10% of spikelets",
        "3": "sorghum panicle with moderate ergot infection, honeydew droplets on 11-25% of spikelets",
        "4": "sorghum panicle with heavy ergot infection, extensive honeydew on 26-50% of spikelets, visible mold",
        "5": "sorghum panicle with severe ergot infection, entire panicle covered in honeydew, over 50% affected, sclerotia forming"
      },
      "tier3": "llm_few_shot"
    },
    "anthracnose_severity": {
      "tier1": null,
      "tier2_labels": {
        "1": "healthy sorghum leaf with no anthracnose lesions",
        "2": "sorghum leaf with few small anthracnose lesions, 1-10% leaf area affected",
        "3": "sorghum leaf with moderate anthracnose, lesions on 11-25% of leaf area",
        "4": "sorghum leaf with severe anthracnose, 26-50% leaf area covered in lesions",
        "5": "sorghum leaf heavily damaged by anthracnose, over 50% leaf area with coalescing lesions"
      },
      "tier3": "llm_few_shot"
    },
    "flowering_stage": {
      "tier1": null,
      "tier2_labels": {
        "1": "sorghum field plot with no visible panicles or all panicles still in boot stage, no flowering",
        "2": "sorghum field plot with less than 25 percent of plants showing panicles with extruded yellow anthers, most plants not yet flowering",
        "3": "sorghum field plot with approximately 50 percent of plants showing yellow anthers on panicles, half of the plot is flowering",
        "4": "sorghum field plot with more than 75 percent of plants flowering, most panicles have visible anthers, some starting to dry",
        "5": "sorghum field plot fully past flowering, all panicles done with anthesis, grain filling has begun, no fresh anthers visible"
      },
      "tier3": "llm_few_shot",
      "photo_type": "plot_overview",
      "auto_action": {
        "on_class_3": "prompt_record_flowering_date",
        "compute": "days_to_flowering = flowering_date - trial.sowing_date"
      }
    },
    "compactness_score": {
      "tier1": null,
      "tier2_labels": {
        "1": "very loose open sorghum panicle with widely spaced branches",
        "2": "loose sorghum panicle with visible gaps between branches",
        "3": "medium compact sorghum panicle with moderate branch density",
        "4": "compact sorghum panicle with tightly packed branches",
        "5": "very compact dense sorghum panicle, cylindrical shape, no gaps"
      },
      "tier3": "llm_few_shot"
    }
  },
  "clip_model": {
    "url": "/models/mobileclip-s0-vision.onnx",
    "version": "v1",
    "size_mb": 12,
    "input_size": 256,
    "embedding_dim": 512
  }
}
```

### 4.4 Model Size Budget (100MB target)

| Component | Size | Purpose |
|-----------|------|---------|
| MobileCLIP-S0 vision encoder | ~12 MB | Shared zero-shot for all traits |
| Precomputed text embeddings | ~50 KB total | Per-trait label embeddings (2KB each x 25 traits) |
| ONNX Runtime WASM | ~12 MB | Inference engine (already cached) |
| Ergot severity model | ~13 MB | Fine-tuned MobileNetV3 |
| Anthracnose severity model | ~13 MB | Fine-tuned MobileNetV3 (future) |
| 5-8 more fine-tuned models | ~40-65 MB | As training data accumulates |
| **Total** | **~90-115 MB** | Within budget, lazy-loaded per trait |

**Lazy loading strategy:** Only download models the user's active trial actually uses. A sorghum trial downloads ergot + anthracnose models. A grape trial downloads mildew + botrytis models. CLIP model always downloaded (universal fallback).

---

## 5. Training Management Dashboard

### 5.1 Access Model

**Role-based visibility:**
- **Admin users** see full Training Management page (upload images, trigger training, view accuracy)
- **Collector users** see only a "Model Status" badge on Settings page (which models are available, version info)
- Accessible via `/settings/training` (admin) or model status widget on `/settings` (all users)

### 5.2 Dashboard Features

#### Model Overview Panel
- List all traits with AI capability
- Per-trait: model status (trained / untrained / training), accuracy %, version, last trained date
- Total model storage used vs budget
- "Sync Models" button to download latest models to device

#### Per-Trait Training Panel
- **Training data stats:** X images per class, total labeled images, class balance bar chart
- **Reference images:** Upload/manage reference images per severity level
- **Training samples:** Browse user-submitted labeled photos (from field observations)
- **Actions:**
  - "Train Model" button → triggers backend training job
  - "Export Training Data" → CSV download for external training
  - "Import Model" → upload pre-trained ONNX file
- **Training status:** progress indicator, ETA, loss curve (if training)
- **Model performance:** accuracy %, confusion matrix, per-class precision/recall

#### CLIP Label Editor
- For traits using Tier 2 (zero-shot CLIP)
- Edit text descriptions per severity level
- "Test Labels" button → run CLIP inference on reference images → show accuracy
- Preview how well zero-shot performs before committing to training a fine-tuned model

### 5.3 Training Pipeline

```
Admin clicks "Train Model" for trait X
         │
         ▼
Backend: POST /training/jobs
         │
         ├─ Collect training data:
         │   ├─ Reference images (backend/reference_images/{trait}/)
         │   └─ User-labeled field photos (from training_samples table)
         │
         ├─ Train MobileNetV3-Large:
         │   ├─ Phase 1: Frozen base, 10 epochs
         │   └─ Phase 2: Fine-tune top 30 layers, 20 epochs
         │
         ├─ Export: FP32 → INT8 quantize → ONNX
         │
         ├─ Validate: Test accuracy, confusion matrix
         │
         ├─ Deploy: Copy to frontend/public/models/{trait}-v{N}.onnx
         │
         └─ Update manifest.json with new model info
         │
         ▼
Frontend: Next "Sync Models" downloads new model
```

---

## 6. RunPod Integration

### 6.1 Setup

- **GPU:** 24GB (L4 or A5000) — $0.89/hr active, $0 idle
- **Model:** Qwen2-VL-7B-Instruct via vLLM
- **Deployment:** Docker container on RunPod Serverless
- **Scaling:** 0 min workers (scale to zero), 3 max workers
- **Cold start:** ~15-30s with FlashBoot, warm: <100ms overhead

### 6.2 Cost Estimate

| Usage | Images/Month | RunPod Cost | Gemini Cost | Savings |
|-------|-------------|-------------|-------------|---------|
| 1 researcher, 1 trial | 240 | $0.18 | $0.24-2.40 | Minimal |
| 5 researchers, 10 trials | 2,400 | $1.80 | $2.40-24.00 | Moderate |
| 20 researchers, 50 trials | 12,000 | $9.00 | $12-120 | Significant |
| 100 researchers (university) | 60,000 | $45.00 | $60-600 | Very significant |

RunPod becomes cost-effective at ~5+ active researchers and provides data privacy guarantees.

### 6.3 Fallback Chain

```
Tier 1 (local ONNX) → confidence >= threshold? → DONE
    │ no
    ▼
Tier 2 (CLIP zero-shot) → confidence >= threshold? → DONE
    │ no
    ▼
Online? ─── no ──→ Return best local result + "low confidence" badge
    │ yes
    ▼
RunPod available? ─── yes ──→ RunPod inference → DONE
    │ no
    ▼
Gemini API → success? → DONE
    │ no
    ▼
Groq API → success? → DONE
    │ no
    ▼
Return best local result + "could not verify" badge
```

---

## 7. Scaling Architecture

### 7.1 Multi-User Considerations

| Concern | Solution |
|---------|----------|
| Model download bandwidth | CDN (Vercel edge) for ONNX files; ETags for cache invalidation |
| Image storage | GCS/S3 with signed URLs; per-trial folders |
| Training data isolation | `training_samples` table has `user_id` — attribute contributions |
| Concurrent training jobs | Queue-based: one training job at a time per trait; Redis or DB-based job queue |
| Model versioning | `{trait}-v{N}.onnx` naming; manifest.json tracks active version per trait |

### 7.2 Image Storage Strategy

```
storage/
├── uploads/              # User field photos (existing)
│   ├── {uuid}.jpg        # UUID-named, referenced in images table
│   └── ...
├── reference_images/     # Admin-uploaded reference images
│   ├── ergot_severity/
│   │   ├── level_1/
│   │   ├── level_2/
│   │   └── ...
│   └── anthracnose_severity/
│       ├── level_1/
│       └── ...
├── training_exports/     # Organized training data (generated from DB)
│   ├── ergot_severity/
│   │   ├── 1/ (symlinks or copies)
│   │   ├── 2/
│   │   └── ...
│   └── ...
└── models/               # Trained model artifacts
    ├── ergot-severity-v1.onnx
    ├── ergot-severity-v2.onnx
    ├── anthracnose-severity-v1.onnx
    └── training_reports/
        ├── ergot-severity-v2-report.json
        └── ...
```

### 7.3 Latency Guarantees

| Operation | Target | How |
|-----------|--------|-----|
| Fine-tuned model inference | <200ms | MobileNetV3 INT8 on WASM |
| CLIP zero-shot inference | <500ms | MobileCLIP-S0 INT8 + precomputed embeddings |
| Model loading (first use) | <3s | Lazy load from PWA cache |
| Model download (first visit) | <30s on 3G | Lazy per-trait, ~13MB each |
| RunPod warm inference | <4s | Qwen2-VL-7B on L4 GPU |
| LLM API fallback | <5s | Gemini Flash |

---

## 8. Implementation Phases

### Phase 1: Foundation — Model Registry & Dynamic Loading (Week 1)
**Goal:** Replace hardcoded single-model loading with dynamic multi-model system.

- [ ] Create `manifest.json` schema and serve from backend
- [ ] Refactor `localClassifier.ts` → `ModelManager` class that loads models by trait ID
- [ ] Lazy model loading: download + cache only when trait is first used
- [ ] Preload models for active trial's traits on trial entry
- [ ] Fix: call `preloadModel()` on app startup for current trial
- [ ] Model version checking: compare cached version vs manifest, re-download if stale
- [ ] Update `classifierService.ts` to accept trait ID and route to correct model
- [ ] Update `ObservationEntry.tsx` to pass trait context to classifier
- [ ] Add model status indicators in UI (loaded / loading / error / not available)

### Phase 2: CLIP Zero-Shot Integration (Week 2)
**Goal:** Any categorical trait gets AI classification without training data.

- [ ] Export MobileCLIP-S0 vision encoder to ONNX INT8
- [ ] Precompute text embeddings for all sorghum traits, ship as JSON
- [ ] Create `clipClassifier.ts` — loads CLIP model, computes image embedding, cosine similarity with text embeddings
- [ ] Integrate into `classifierService.ts` as Tier 2 fallback
- [ ] Add CLIP label editor in Training Management dashboard (admin)
- [ ] Test zero-shot accuracy on ergot reference images
- [ ] PWA cache configuration for CLIP model

### Phase 3: Training Management Dashboard (Week 3)
**Goal:** Admin UI for managing models, training data, and triggering training jobs.

- [ ] Backend: `/training/jobs` CRUD endpoints (create, status, list, cancel)
- [ ] Backend: Training job runner (background process, one at a time)
- [ ] Backend: Model artifact storage + manifest.json auto-update after training
- [ ] Backend: Generalize `train_model.py` to accept any trait (not just ergot)
- [ ] Backend: Reference image management endpoints (upload, list, delete per trait per level)
- [ ] Frontend: `/settings/training` page (admin only)
  - Model overview panel
  - Per-trait training panel (data stats, reference images, train button)
  - Training status + history
  - Model performance display (accuracy, confusion matrix)
- [ ] Frontend: Model status badge on Settings page (all users)
- [ ] Add `user_id` to `TrainingSample` model for multi-user attribution

### Phase 4: RunPod Integration (Week 4)
**Goal:** Self-hosted GPU inference as middle tier between local and LLM APIs.

- [ ] Set up RunPod account + serverless endpoint with Qwen2-VL-7B
- [ ] Create Docker container with vLLM serving
- [ ] Backend: `/inference/runpod` proxy endpoint (keeps RunPod API key server-side)
- [ ] Backend: Generalized prompt template per trait (reuse reference images)
- [ ] Update `classifierService.ts` Tier 3 fallback chain: RunPod → Gemini → Groq
- [ ] Health check + circuit breaker for RunPod endpoint
- [ ] Cost monitoring dashboard (optional)

### Phase 5: Anthracnose, Flowering Stage & Additional Sorghum Traits (Week 5)
**Goal:** Expand AI to cover all sorghum traits from Section 3.

- [ ] Add `plot_overview` as new image type (alongside `panicle` and `full_plant`)
- [ ] Implement flowering stage classification:
  - [ ] Write CLIP text labels for 5 flowering stages (already in manifest)
  - [ ] Add "plot overview" photo capture section in ObservationEntry
  - [ ] AI classifies flowering stage → if stage 3 (~50%) → prompt to record today's date
  - [ ] Auto-compute `days_to_flowering = flowering_date - trial.sowing_date`
  - [ ] Display computed days-to-flowering on dashboard
- [ ] Collect/create reference images for anthracnose severity (5 levels x 5-10 images)
- [ ] Train anthracnose severity CNN model
- [ ] Write CLIP text labels for compactness, fertility
- [ ] Add panicle length estimation to LLM prompts (Tier 3 only initially)
- [ ] Add plant count as manual-only trait (detection model is future work)
- [ ] Update manifest.json with all new traits
- [ ] Test full offline workflow: capture photo → local inference → save observation

### Phase 6: Multi-Crop Expansion (Week 6+)
**Goal:** Add crop preset packs with AI-ready traits.

- [ ] Create trait preset packs for top crops (maize, wheat, rice, grape, cotton)
- [ ] Write CLIP text labels for each crop's severity traits
- [ ] Train fine-tuned models for high-priority traits with public datasets (PlantVillage)
- [ ] Update training pipeline to support arbitrary trait/crop combinations
- [ ] Test cross-crop model loading (switching between trials downloads correct models)

---

## 9. Files to Create / Modify

### New Files
| File | Purpose |
|------|---------|
| `frontend/src/services/modelManager.ts` | Dynamic model loading, caching, versioning |
| `frontend/src/services/clipClassifier.ts` | CLIP zero-shot inference |
| `frontend/src/pages/TrainingDashboard.tsx` | Admin training management UI |
| `frontend/public/models/manifest.json` | Model registry |
| `frontend/public/models/mobileclip-s0-vision.onnx` | CLIP vision encoder |
| `frontend/public/models/clip-embeddings/` | Precomputed text embeddings per trait |
| `backend/routers/training_jobs.py` | Training job management endpoints |
| `backend/services/model_trainer.py` | Generalized training pipeline |
| `backend/services/runpod_client.py` | RunPod serverless API client |

### Modified Files
| File | Change |
|------|--------|
| `frontend/src/services/localClassifier.ts` | Refactor to use ModelManager |
| `frontend/src/services/classifierService.ts` | Add trait-aware routing, CLIP tier, RunPod tier |
| `frontend/src/pages/ObservationEntry.tsx` | Pass trait context to classifier |
| `frontend/src/App.tsx` | Preload models on startup |
| `frontend/vite.config.ts` | Cache rules for manifest + CLIP model |
| `backend/models.py` | Add TrainingJob model, update TrainingSample |
| `backend/schemas.py` | Add TrainingJob schemas |
| `backend/routers/training.py` | Extend with job management |
| `backend/services/ai_classifier.py` | Add RunPod as inference option |
| `backend/main.py` | Register new routers |

---

## 10. Success Criteria

| Metric | Target |
|--------|--------|
| Offline inference latency (fine-tuned) | <200ms on mid-range phone |
| Offline inference latency (CLIP zero-shot) | <500ms on mid-range phone |
| Total model download for sorghum trial | <50MB (ergot + CLIP + WASM) |
| Ergot severity accuracy (fine-tuned) | >80% |
| Zero-shot accuracy (new traits, no training) | >40% (useful as suggestion) |
| Training job completion | <15 minutes on CPU |
| Cold start to first inference | <5 seconds |
| System works fully offline after first visit | Yes |

---

## 11. Open Questions

1. **MobileCLIP-S0 license** — Apple's model is under a research license. Need to verify it's suitable for this project's use case.
2. **RunPod region** — Closest region to UGA for lowest latency?
3. **Anthracnose reference images** — Do we have any labeled anthracnose images, or do we need to source from public datasets?
4. **Training on Vercel** — Current deployment is on Vercel (serverless). Training jobs need a persistent process. Options: separate training server, RunPod for training, or local-only training.
