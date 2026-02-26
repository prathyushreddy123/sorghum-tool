# SorghumField — Features Documentation

## Overview

SorghumField is a mobile-first PWA for sorghum phenotyping data collection, targeting researchers at UGA. It enables visual disease severity scoring, AI-assisted trait measurement, photo documentation, and CSV data export for downstream analysis in R/Python.

**Stack:** React 18 + TypeScript + Tailwind (frontend) | FastAPI + SQLAlchemy + SQLite (backend) | Gemini Flash + Groq Llama (AI)

---

## 1. Trial Management

### Create Trial
- Fields: name, location, start date, optional end date
- Crop defaults to "sorghum"
- **Route:** `/trials/new`

### Trial List (Home)
- Lists all trials ordered by creation date
- Shows location and plot count per trial
- Scoring progress indicator (X/Y plots scored)
- Delete trial with confirmation dialog
- **Route:** `/`

### Trial Dashboard
- Progress bar showing % of plots scored
- Summary stat cards: Average Ergot Severity, Average Plant Height, Flowering Date count, Total Plots
- Ergot severity distribution histogram (Recharts bar chart, color-coded by severity)
- Action buttons: Record Observations, Import/View Plots, Severity Heatmap, Export CSV, Delete Trial
- Auto-refreshes stats on window focus
- **Route:** `/trials/:trialId`

---

## 2. Plot Management

### CSV Import
- Bulk import plots from CSV file
- Required columns: `plot_id`, `genotype`, `rep`, `row`, `column`
- Error reporting per row (e.g. "Row 5: invalid rep value")
- **Endpoint:** `POST /trials/{trialId}/plots/import`

### Plot List
- Search by plot ID or genotype (full-text)
- Filter tabs: All / Unscored / Scored (with counts)
- Plot cards show: plot ID, genotype, rep, row/column, scored status badge
- Click a plot to open observation entry
- Delete individual plots with confirmation
- **Route:** `/trials/:trialId/plots`

### Barcode/QR Scanner
- Camera-based scanning using html5-qrcode library
- Scans barcodes on plot tags for rapid plot lookup
- Environment-facing camera at 10 fps
- Modal overlay with scanner region

### Smart Navigation
- "Save & Next" auto-advances to the next unscored plot (by row, then column)
- Wraps around to beginning if no unscored plots remain after current position
- Shows "All plots scored!" when trial is complete
- Prev/Next buttons for sequential navigation with position counter (e.g. "42/240")
- **Endpoint:** `GET /trials/{trialId}/plots/{plotId}/next-unscored`

---

## 3. Observation Entry

The core data collection page where researchers score plots in the field.
**Route:** `/trials/:trialId/collect/:plotId`

### Layout (top to bottom)
1. Plot header (ID, genotype, rep, row/column, GPS, weather)
2. Panicle Photo + AI severity prediction
3. Ergot Severity selector (1-5 buttons)
4. Flowering Date picker
5. Full-Plant Photo + AI height prediction
6. Plant Height input (cm)
7. Notes
8. Save & Next / Save (Stay Here) buttons
9. Prev / Next navigation

### Ergot Severity Scoring
- 5 large buttons (1-5) with labels and percentage ranges:
  - 1 = None (0%)
  - 2 = Low (1-10%)
  - 3 = Moderate (11-25%)
  - 4 = High (26-50%)
  - 5 = Severe (>50%)
- Selected button highlighted in green
- "View Reference Images" link opens reference modal with example photos per level
- Minimum 60px button height for field use

### Flowering Date
- Native date picker input
- Stored as YYYY-MM-DD string

### Plant Height
- Numeric input (integer only, 50-400 cm range)
- Inline validation with error messages
- Auto-filled by AI when full-plant photo is taken

### Notes
- Optional free-text textarea
- Attached to the last observation on save

### Bulk Save
- All traits saved in a single API call (`POST /plots/{plotId}/observations/bulk`)
- Upsert behavior: one observation per trait per plot (updates existing, creates new)
- GPS coordinates and weather data attached to each observation
- At least one trait value required before saving

---

## 4. AI-Powered Classification

### 4a. In-Browser Offline AI (`feature/local-ai-classification`)

**Status:** Implemented, local branch only (not yet merged to main)

**Architecture:** 3-tier hybrid inference
1. **Tier 1 — Local ONNX Model:** MobileNetV3-Large INT8 (13MB), runs in-browser via `onnxruntime-web` (WASM). <200ms inference, fully offline after first download.
2. **Tier 2 — CLIP Zero-Shot:** (Planned — Phase 2) MobileCLIP-S0 for traits without trained models.
3. **Tier 3 — Cloud API Fallback:** Gemini 2.5 Flash + Groq Llama 4 Scout (existing). Used when local confidence < threshold.

**How it works:**
1. User captures photo (panicle, leaf, or plot overview depending on trait)
2. Phase 1 (instant): Compressed blob → local ONNX model → prediction in <200ms
3. If confidence >= threshold → auto-populate trait value, done (no upload needed)
4. Phase 2 (if low confidence + online): Upload photo → API fallback → better prediction
5. Fire-and-forget: Submit labeled data to `/training/samples` for all AI-supported traits

**Inference files:**
- `frontend/src/services/localClassifier.ts` — Low-level ONNX inference (legacy, kept for reference)
- `frontend/src/services/modelManager.ts` — **Dynamic multi-model manager** (Phase 1 addition)
- `frontend/src/services/classifierService.ts` — Trait-aware hybrid strategy orchestrator
- `frontend/public/models/ergot-severity-v1.onnx` — 13MB INT8 quantized model
- `frontend/public/models/manifest.json` — **Model registry** (Phase 1 addition)

**Training pipeline:**
- `backend/scripts/train_model.py` — MobileNetV3-Large fine-tuning (PyTorch → ONNX)
- MobileNetV3-Large with frozen base + custom classification head
- 2-phase training: 10 epochs frozen → 20 epochs fine-tune top 30 layers
- Data augmentation: 50x multiplier for reference images (resize crop, flip, rotation, color jitter)
- INT8 quantization reduces model from ~22MB FP32 → 13MB
- CLI: `python scripts/train_model.py --bootstrap --output ../frontend/public/models/ergot-severity-v1.onnx`

**Training data collection endpoints:**
- `POST /training/samples` — Submit labeled sample (image_id + severity 1-5)
- `GET /training/samples/stats` — Distribution stats
- `GET /training/export` — CSV export for training pipeline
- Backend router: `backend/routers/training.py`
- DB model: `TrainingSample` in `backend/models.py`

**PWA offline caching (Workbox in `vite.config.ts`):**
- Manifest Cache (NetworkFirst): `manifest.json` cached 24 hours
- ML Model Cache (CacheFirst): `.onnx` files cached 30 days, up to 20 models
- WASM Cache (CacheFirst): `ort-wasm-*.wasm` cached 30 days
- After first visit: ~25MB cached (13MB model + 12MB WASM) → fully offline inference

---

### 4b. Model Registry & Dynamic Loading (Phase 1 — Completed)

**Status:** Implemented on `feature/local-ai-classification`

Replaces the hardcoded single-model system with a dynamic registry that supports any number of traits and models.

**Model Manifest (`frontend/public/models/manifest.json`):**
- Defines per-trait AI configuration: Tier 1 model URL, Tier 2 CLIP labels, Tier 3 strategy
- Each trait specifies: `photo_type` (panicle / leaf / plot_overview), `confidence_threshold`, `classes`
- 5 traits configured: `ergot_severity`, `anthracnose_severity`, `flowering_stage`, `compactness_score`, `fertility_score`
- Only `ergot_severity` has a Tier 1 model; others have Tier 2 CLIP labels ready for Phase 2

**ModelManager (`frontend/src/services/modelManager.ts`):**
- Singleton class managing all ONNX model lifecycle
- `getManifest()` — Fetches and caches the manifest
- `getTraitEntry(traitName)` — Looks up AI config for a trait
- `hasAISupport(traitName)` — Checks if any tier is available
- `getPhotoType(traitName)` — Returns required photo type (panicle/leaf/plot_overview)
- `loadModel(traitName)` — Lazy-loads a Tier 1 ONNX model by trait name
- `preloadModels(traitNames[])` — Preloads models for a set of traits (fire-and-forget)
- `classify(traitName, blob)` — Runs inference, returns `{classValue, confidence, allScores}`
- `getConfidenceThreshold(traitName)` — Per-trait threshold from manifest
- `onStatusChange(listener)` — Subscribe to model loading status updates
- Image preprocessing: ImageNet normalization, dynamic input size from manifest

**Trait-Aware Classifier (`frontend/src/services/classifierService.ts`):**
- `classifyTrait(traitName, blob, imageId?)` — Main entry point, routes through tiers:
  - Tier 1: `modelManager.classify()` if trained model exists
  - Tier 2: CLIP zero-shot (placeholder — Phase 2)
  - Tier 3: API fallback (currently only `ergot_severity` via existing endpoint)
- `preloadModels(traitNames[])` — Delegates to ModelManager
- `hasAISupport(traitName)` — Checks manifest
- `classifySeverity()` — Legacy backward-compatible wrapper

**ObservationEntry Integration (`frontend/src/pages/ObservationEntry.tsx`):**
- Resolves which traits have AI support on page load (from manifest)
- Preloads Tier 1 models for current trial's categorical traits
- Matches captured photos to correct trait by `photo_type` in manifest
- Submits training samples for ALL AI-supported categorical traits (not just ergot)
- Shows AI support badge: "AI: ergot severity, anthracnose severity, ..." next to photo section
- `handleImageCaptured()` and `handleImageUploaded()` are fully trait-aware

**What this enables (for future phases):**
- Add a new trait's AI: just add entry to `manifest.json` + drop ONNX model in `/models/`
- RunPod fallback (Phase 4): `classifierService.ts` Tier 3 routes to RunPod
- No code changes needed to support new traits — manifest-driven

### 4c. CLIP Zero-Shot Classification (Phase 2 — Completed)

**Model:** MobileCLIP2-S0 vision encoder exported to ONNX FP32 (1.7MB)

**How it works:**
1. CLIP vision encoder runs in-browser via ONNX Runtime Web (WASM)
2. Precomputed text embeddings for each trait's class labels stored as JSON files (~56KB each)
3. Image → vision encoder → 512-dim image embedding → cosine similarity with text embeddings → softmax → prediction
4. Temperature-scaled softmax (τ=0.01) produces sharp probability distributions

**Files:**
- `frontend/src/services/clipClassifier.ts` — CLIP zero-shot inference engine
  - Loads vision ONNX model (singleton, lazy)
  - Loads per-trait precomputed text embeddings from `/models/clip-embeddings/<trait>.json`
  - Preprocesses images (resize to 256×256, ImageNet normalize, CHW layout)
  - Computes cosine similarity between image and text embeddings
  - Returns `LocalPrediction` with softmax confidence scores
- `backend/scripts/export_clip.py` — Export pipeline
  - Exports MobileCLIP2-S0 vision encoder to ONNX using `open_clip` + PyTorch
  - Precomputes L2-normalized text embeddings for all traits in `manifest.json`
  - Outputs: `mobileclip-s0-vision.onnx` + `clip-embeddings/*.json`
- `frontend/public/models/mobileclip-s0-vision.onnx` — Vision encoder (1.7MB FP32)
- `frontend/public/models/clip-embeddings/*.json` — 5 trait embedding files

**Integration with 3-tier architecture:**
- CLIP is Tier 2 in `classifierService.ts`, between Tier 1 (fine-tuned ONNX) and Tier 3 (API)
- Accepts predictions at 80% of Tier 1's confidence threshold (e.g., 0.56 instead of 0.70)
- Falls back to API if CLIP confidence is too low
- CLIP result stored as fallback even if below threshold — returned with `lowConfidence: true` if API also fails
- `preloadModels()` now preloads both Tier 1 and CLIP models in parallel

**Supported traits (via tier2_labels in manifest.json):**
- `ergot_severity` — panicle photos, 5-class honeydew severity
- `anthracnose_severity` — leaf photos, 5-class lesion severity
- `flowering_stage` — plot overview photos, 5-class flowering progression
- `compactness_score` — panicle photos, 5-class panicle density
- `fertility_score` — panicle photos, 5-class seed set

**Adding a new trait:** Add `tier2_labels` to `manifest.json`, re-run `export_clip.py` to generate embeddings. No frontend code changes needed.

---

### 4d. Cloud API Classification (Original — on main branch)

### Ergot Severity Prediction

**Trigger:** Automatically after uploading a panicle photo (if severity not already scored)

**Architecture:**
- Primary: Google Gemini 2.0 Flash (free tier ~250 requests/day)
- Fallback: Groq API with Llama 4 Scout (free tier ~1000 requests/day)
- Backend inference keeps API keys secure

**How it works:**
1. User takes a panicle close-up photo
2. Photo is compressed (max 1200px, JPEG 0.8) and uploaded
3. Backend loads 10 reference images (2 per severity level, max 500KB each) from `backend/reference_images/`
4. Sends few-shot prompt + reference images + target photo to Gemini
5. AI returns: `{severity: 0-5, confidence: 0.0-1.0, reasoning: "...", provider: "gemini"}`
6. Frontend auto-applies severity (if 1-5) and shows info banner

**Sorghum Identification:**
- AI first verifies the image is a sorghum panicle
- Returns severity 0 with "Not a sorghum panicle" if it's rice, corn, wheat, etc.
- Frontend shows yellow warning; user can still score manually

**UI Feedback:**
- Loading: Spinner + "Analyzing photo..."
- Success (severity 1-5): Blue banner — "AI set severity to **X** — tap below to change"
- Low confidence (<80%): Appends "(low confidence)" to message
- Not sorghum (severity 0): Yellow banner — "Not a sorghum panicle"
- AI error/unavailable: Gray banner — "AI analysis unavailable. Score manually below."

**Reference Images:**
- 27 labeled images in `backend/reference_images/` (named `severity_{1-5}_{a-m}.jpg`)
- AI selects 2 smallest per level (max 500KB each) to minimize API payload (~502KB total)
- Labeled using Gemini via `backend/scripts/label_reference_images.py` and `label_remaining_images.py`

**Endpoint:** `POST /images/{imageId}/predict-severity`

### Plant Height Estimation

**Trigger:** Automatically after uploading a full-plant photo (if height not already entered)

**Architecture:** Same Gemini/Groq dual-provider setup as severity

**How it works:**
1. User takes a full-plant photo showing the entire sorghum plant alongside a meter stick or graduated pole
2. Photo is compressed and uploaded with `image_type=full_plant`
3. Backend sends prompt + photo to Gemini (no reference images needed — the meter stick IS the reference)
4. AI identifies the meter stick markings, measures from ground to panicle tip
5. Returns: `{height_cm: 0-400, confidence: 0.0-1.0, reasoning: "...", provider: "gemini"}`
6. Frontend auto-fills plant height input (if height_cm >= 50)

**UI Feedback:**
- Loading: Spinner + "Estimating height..."
- Success (50-400 cm): Blue banner — "AI estimated **X cm** — edit below to change"
- Cannot measure (0): Yellow banner — "Could not estimate height" + reasoning
- AI error/unavailable: Gray banner — "AI height estimation unavailable. Enter manually below."

**Endpoint:** `POST /images/{imageId}/predict-height`

### Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| No API keys configured | `predict_severity()` / `predict_height()` return None -> 503 -> manual mode |
| Gemini rate limited / fails | Falls through to Groq automatically |
| Groq also fails | Returns None -> 503 -> manual entry always works |
| AI disabled (`AI_CLASSIFICATION_ENABLED=false`) | Predictions skip entirely |
| User already scored before photo | AI prediction skipped (no overwrite) |

---

## 5. Image Management

### Two Photo Types

| Type | Purpose | AI Action |
|------|---------|-----------|
| **Panicle** (default) | Close-up of sorghum panicle for ergot scoring | Triggers severity prediction |
| **Full Plant** | Full plant with meter stick for height measurement | Triggers height estimation |

### Upload
- Camera capture (environment-facing) or file picker
- Client-side compression: max 1200px width, JPEG quality 0.8
- Server-side validation: max 5MB, allowed types: JPEG, PNG, WebP, HEIC/HEIF
- Stored on disk in `backend/uploads/` with UUID filenames

### Gallery
- Thumbnail grid (80x80px) per photo type section
- Delete button (red X) on each thumbnail
- Separate galleries for panicle and full-plant photos on the same page

### Image Type Filtering
- `GET /plots/{plotId}/images?image_type=panicle` — panicle photos only
- `GET /plots/{plotId}/images?image_type=full_plant` — full-plant photos only
- `GET /plots/{plotId}/images` — all photos (backward compatible)

---

## 6. GPS & Weather Integration

### Geolocation
- Automatic GPS capture on page load (requires browser permission)
- High accuracy mode, 10-second timeout
- Displays coordinates (5 decimal places) in plot header
- Status indicators: "Getting location...", "GPS: lat, lng", "Location permission denied", "Location unavailable"
- Coordinates attached to all observations on save

### Weather
- Automatically fetched from Open-Meteo API when GPS is available
- Captures current temperature (C) and relative humidity (%)
- Displayed in plot header: "28.5 C / 65% RH"
- Weather data attached to all observations on save
- Falls back silently on API failure

---

## 7. Data Visualization

### Severity Heatmap
- Spatial grid visualization by field row/column
- Color-coded cells: Green (1) -> Yellow -> Orange -> Red (5), Gray (unscored)
- Click any cell to navigate directly to that plot's observation entry
- Row/column headers for orientation
- Legend with all severity levels
- **Route:** `/trials/:trialId/heatmap`

### Severity Histogram
- Bar chart showing distribution of ergot severity scores across the trial
- X-axis: severity labels (None, Low, Mod, High, Sev)
- Y-axis: number of plots
- Color-coded bars matching severity color scheme
- Displayed on trial dashboard (if scored data exists)

---

## 8. CSV Export

### Export Format
One row per plot with observations pivoted into columns:

```
plot_id, genotype, rep, row, column, ergot_severity, flowering_date, plant_height, latitude, longitude, temperature, humidity, notes, recorded_at
```

- Empty cells for missing observations
- Uses latest observation's metadata (GPS, weather, notes) when multiple exist
- Downloads as blob via browser
- **Endpoint:** `GET /trials/{trialId}/export`

---

## 9. API Key Authentication

### Key Management
- Generate keys with user-defined labels (e.g., "R script", "Python notebook")
- Keys use format: `sf_{48-char-hex}` (SHA-256 hashed for storage)
- Raw key shown only once on creation (with copy button)
- List active keys with creation and last-used timestamps
- Revoke keys (soft delete)
- **Route:** `/settings`

### Authentication Flow
- Pass key via `X-API-Key` header
- Middleware validates hash against stored keys
- Rate limiting: 100 requests per 60-second window (in-memory)
- Returns 401 for invalid keys, 429 for rate limit exceeded

### Code Examples (shown in Settings page)
**Python:**
```python
import requests
headers = {"X-API-Key": "sf_your_key_here"}
r = requests.get("http://localhost:8000/trials", headers=headers)
```

**R:**
```r
library(httr2)
req <- request("http://localhost:8000/trials") |>
  req_headers("X-API-Key" = "sf_your_key_here")
resp <- req_perform(req)
```

---

## 10. Database Schema

```
Trial (1) ---> (*) Plot (1) ---> (*) Observation
                    |
                    +-----------> (*) Image

APIKey (standalone)
```

| Entity | Key Fields |
|--------|-----------|
| **Trial** | id, name, crop, location, start_date, end_date, created_at |
| **Plot** | id, trial_id (FK), plot_id, genotype, rep, row, column, notes |
| **Observation** | id, plot_id (FK), trait_name, value, recorded_at, notes, latitude, longitude, temperature, humidity |
| **Image** | id, plot_id (FK), filename, original_name, image_type, uploaded_at |
| **APIKey** | id, user_label, key_hash, created_at, last_used_at, is_active |

Cascade deletes: Trial -> Plots -> Observations + Images

---

## 11. Configuration

### Environment Variables (`backend/.env.example`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | No | None | Google Gemini API key for primary AI predictions |
| `GROQ_API_KEY` | No | None | Groq API key for fallback AI predictions |
| `AI_CLASSIFICATION_ENABLED` | No | `true` | Enable/disable all AI predictions |

### Frontend Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE` | `http://localhost:8000` | Backend API base URL |

---

## 12. Design Principles

- **Mobile-first:** Designed for phone screens (iPhone SE 375px minimum)
- **Thumb-friendly:** Critical actions in bottom 2/3 of screen, minimum 44x44px touch targets
- **High contrast:** Readable in bright sunlight, 4.5:1 color contrast ratio
- **Minimal taps:** Most common flow (score + save + next) in 3 taps
- **Graceful degradation:** AI features enhance but never block the manual workflow

### Color Palette
| Color | Hex | Usage |
|-------|-----|-------|
| Primary Green | #2E7D32 | Buttons, active states, GPS indicator |
| Light Green | #81C784 | Severity 1, badges |
| Warning Yellow | #FFC107 | Severity 2-3, warnings |
| Error Red | #D32F2F | Severity 5, errors, delete buttons |
| Background | #FAFAFA | Page background |

---

## 13. Future Roadmap

### In-Browser AI Classification — PARTIALLY IMPLEMENTED
See Section 4a above. MobileNetV3 ONNX model runs in-browser for ergot severity.
Full multi-trait architecture planned in `PRD_AI_CLASSIFICATION.md`.

### Planned AI Expansion (see PRD_AI_CLASSIFICATION.md for full details)
- **CLIP zero-shot:** MobileCLIP-S0 (~12MB) for instant AI on any categorical trait without training
- **RunPod serverless:** Self-hosted Qwen2-VL-7B as mid-cost fallback tier
- **Multi-trait models:** Separate fine-tuned models per trait (anthracnose, compactness, fertility, etc.)
- **Training management dashboard:** Admin UI to upload reference images, trigger training, view accuracy
- **Model registry:** `manifest.json` for dynamic model loading per trait per trial
