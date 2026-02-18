# Multi-Crop Expansion Plan
**Branch:** `feature/multi-crop-expansion`
**Date:** 2026-02-17
**Status:** Decisions captured — ready for implementation

---

## Vision & Differentiators

Expand from a sorghum-only tool into a **fully crop-agnostic field phenotyping platform** that competes with and beats GridScore NEXT on three fronts:

1. **AI-assisted scoring** — built-in photo classification using a locally-trained CNN (MobileNetV2). No cloud API costs, improves over time with user data. No other field phenotyping tool has this.
2. **Simpler, faster setup** — crop preset packs, clone-a-trial, guided onboarding. Ready to score in under 5 minutes vs. GridScore NEXT's steep learning curve.
3. **Better mobile UX** — thumb-friendly design, swipe between plots, voice input for numeric traits, bright-sun readability as core design principles.

---

## Context

The current app is hardcoded for sorghum ergot (3 fixed traits). The dynamic trait system in Phase 1 is the foundation everything else builds on.

**Why not perennial-only:** The dynamic trait system is crop-agnostic by nature. Sorghum (the original use case) is annual. Restricting to perennials breaks existing users with no technical benefit. The crop library covers both annuals and perennials.

---

## Decisions Log (from user interviews)

| Topic | Decision |
|---|---|
| Repeated measurements | **Scoring Rounds** — named collection sessions (Round 1: June, Round 2: July) at the trial level |
| Multi-year trials | **Out of scope** — not a priority now |
| User roles | **Labels only** — Admin/Collector roles are informational (tracking who collects), no permission restrictions |
| Offline mode | **Phase 5** — nice to have, workaround acceptable for now |
| Team data sync | Data collected independently, synced/merged later — covered in Phase 5 |
| Custom traits | **Full trait builder** — any name, data type, min/max, categories |
| Categorical widget | **Buttons ≤9, dropdown >9** |
| AI approach | **Local CNN (MobileNetV2)** on the backend — replaces cloud API (Gemini/Groq). Same UX, zero per-inference cost |
| AI training data | Reference images + confirmed field photos accumulate as training data. Admin uploads labeled datasets |
| CNN inference location | **Backend (FastAPI + TensorFlow)** — MobileNetV2 runs on server CPU, keeps phones light |
| Role permissions | **None** — roles are purely tracking labels, anyone can do anything |
| Round visualization | Show latest round by default; toggle/tab to see previous rounds |
| Field navigation | All GridScore NEXT patterns: serpentine, row-by-row, column-by-column, free |
| Scoring UX additions | Voice input for numeric traits + swipe gestures between plots (+ previous round score visible) |
| Export formats | **CSV wide format** (one row per plot) — current format retained |
| Missing feature | **Flag/skip a plot** (flagged, skipped, border row — do not score) |
| Plot metadata | **Custom plot attributes** — extensible beyond fixed fields |
| Trial templates | **Clone trial** — copy plots + traits + config into a new trial with new name/dates |
| Genotype history | **Out of scope** |
| Key differentiator | AI classification + simpler setup + better mobile UX (all three) |

---

## Current App Gaps vs. GridScore NEXT

| Feature | Current App | GridScore NEXT | Plan Phase |
|---|---|---|---|
| Configurable traits | ❌ Hardcoded 3 | ✅ Fully user-defined | Phase 1 |
| Multi-crop support | ❌ Sorghum only | ✅ Multi-species | Phase 1–2 |
| Trait data types | ❌ 3 fixed types | ✅ int/float/date/categorical/text | Phase 1 |
| Scoring rounds | ❌ Single score per trait | ✅ Multi-visit | Phase 1 |
| Custom plot attributes | ❌ Fixed 5 columns | ❌ Also fixed | Phase 1 |
| Flag/skip plots | ❌ None | ✅ Supported | Phase 1 |
| Crop/trait templates | ❌ None | ✅ Presets | Phase 2 |
| Clone trial | ❌ None | ✅ Supported | Phase 2 |
| Guided walk modes | ❌ Sequential only | ✅ Multiple modes | Phase 3 |
| Field plan as nav hub | ✅ Visualization only | ✅ Interactive nav | Phase 3 |
| Multi-trait heatmap | ❌ Ergot only | ✅ Any trait | Phase 3 |
| Per-trait progress | ❌ Overall only | ✅ Per trait | Phase 3 |
| Swipe between plots | ❌ None | ❌ None | Phase 3 |
| Voice input | ❌ None | ❌ None | Phase 3 |
| Previous round score | ❌ None | ✅ Supported | Phase 3 |
| AI classification (local CNN) | ✅ Cloud API only | ❌ None | Phase 4 |
| Team roles + data merge | ❌ None | ✅ QR sharing | Phase 5 |
| Offline/PWA | ❌ Online only | ✅ Full offline | Phase 5 |
| BrAPI integration | ❌ None | ✅ Import/export | Phase 6 |

---

## Phase 1 — Dynamic Trait System + Scoring Rounds (Critical Foundation)

**Priority: Highest** — All other phases depend on this.

### New DB Models

```
Trait
  id, name (slug), label (display name), data_type, unit,
  min_value, max_value, categories (JSON array),
  description, is_required, display_order

TrialTrait (join table)
  trial_id → Trial
  trait_id → Trait
  display_order (per-trial ordering)

ScoringRound
  id, trial_id → Trial
  name (e.g., "Round 1", "Flowering Stage", "Post-harvest")
  scored_at (date — when this round was/is being collected)
  notes (optional description)
  created_at

PlotFlag
  id, plot_id → Plot
  flag_type  (enum: "skipped" | "flagged" | "border" | "missing")
  reason (text, optional)
  flagged_by (user_id, optional)
  flagged_at

PlotAttribute (custom plot metadata)
  id, plot_id → Plot
  key (string — e.g., "rootstock", "treatment")
  value (string)
```

### Modified DB Models

```
Observation
  scoring_round_id → ScoringRound  (NEW — links observation to a round)
  trait_id → Trait                 (replaces hardcoded trait_name enum)
  value (string — same storage, dynamic type)
  [all other fields unchanged]

Plot
  plot_status (enum: "active" | "skipped" | "flagged" | "border")
  [existing fields unchanged]

User
  role (enum: "admin" | "collector" — informational label only, no restrictions)
```

### Supported Trait Data Types

| Type | Validation | Widget |
|---|---|---|
| `integer` | min/max from trait | number input + stepper |
| `float` | min/max, decimal places | number input |
| `date` | YYYY-MM-DD | native date picker |
| `categorical` | value in categories list | buttons if ≤9, dropdown if >9 |
| `text` | max length | text area |
| `image` | via Image model | camera capture (existing) |

### New/Modified API Endpoints

```
# Trait Library
GET  /traits                              → List all trait definitions
POST /traits                              → Create custom trait
GET  /trials/{id}/traits                  → Get traits for a trial
POST /trials/{id}/traits                  → Add trait to trial
DELETE /trials/{id}/traits/{trait_id}     → Remove trait
PUT  /trials/{id}/traits/reorder          → Reorder traits

# Scoring Rounds
GET  /trials/{id}/rounds                  → List scoring rounds
POST /trials/{id}/rounds                  → Create new scoring round
GET  /trials/{id}/rounds/{round_id}       → Get round details + completion
DELETE /trials/{id}/rounds/{round_id}     → Delete round

# Plot Flags
POST /plots/{id}/flag                     → Flag/skip a plot
DELETE /plots/{id}/flag                   → Unflag a plot

# Plot Custom Attributes
GET  /plots/{id}/attributes               → Get custom attributes
POST /plots/{id}/attributes               → Set attribute key/value
DELETE /plots/{id}/attributes/{key}       → Remove attribute

# Modified Endpoints
POST /observations                        → now requires scoring_round_id + trait_id
GET  /trials/{id}/stats                   → dynamic per traits, per round
GET  /trials/{id}/heatmap                 → ?trait_id=&round_id= query params
GET  /trials/{id}/export                  → dynamic columns, round column added
GET  /trials/{id}/plots/next-unscored     → ?round_id=&trait_id= filters
```

### Frontend Changes

#### Trial Creation (multi-step)
1. Trial info (name, crop, location, dates)
2. Trait selection (from preset or custom builder)
3. Create first scoring round (name it, set date)
4. Import plots (CSV — now supports custom attribute columns)

#### ObservationEntry (major refactor)
- Renders trait widgets dynamically based on data type
- Scoring round selector at top (or fixed to current round)
- Shows previous round's value for each trait (if a prior round exists)
- Flag/skip button accessible per plot
- **Swipe left/right** to navigate between plots (Phase 3 UX, implement here)
- Trait validation driven by trait definition

#### Plot List
- Shows plot status (active / skipped / flagged / border)
- Filter by status, filter by "unscored in current round"
- Custom attributes shown in plot detail view

#### Stats & Heatmap
- Stats cards: one per active trait, per round
- Heatmap: trait selector + round selector dropdowns
- Progress: per-trait, per-round completion counts

### Migration Plan (existing sorghum data)
- Alembic migration: add new tables additively (no drops yet)
- Seed a "Sorghum Ergot" scoring round for each existing trial
- Map `trait_name = "ergot_severity"` → new Trait record; same for other 2 traits
- Existing observations get `scoring_round_id` of the seeded round
- Old trait_name column removed after migration verified

---

## Phase 2 — Crop Library & Trial Management

**Priority: High**

### Crop Preset Packs

Stored as JSON fixtures in `backend/fixtures/traits/`, seeded on first run.

#### Annual Cereals & Row Crops
Sorghum, Maize, Wheat, Rice, Cotton, Soybean, Sunflower
- Disease severity (categorical 1–5)
- Flowering date (date)
- Plant height (integer, cm)
- Lodging score (categorical 1–5)
- Maturity date (date)
- Yield (float, kg/plot)
- Stand count (integer)

#### Perennial Forages
Alfalfa, Orchardgrass, Fescue, Bermudagrass, Switchgrass
- Stand density (categorical 1–5)
- Spring regrowth vigor (categorical 1–9)
- Winter survival / persistence (%)
- Disease severity (categorical 1–5)
- Lodging score (categorical 1–5)
- Yield per cut (float, kg/plot)
- Cutting date (date)

#### Vineyards / Grapes
- Powdery mildew severity (categorical 0–5)
- Downy mildew severity (categorical 0–5)
- Botrytis bunch rot (categorical 0–5)
- Canopy density score (categorical 1–5)
- Cluster weight (float, g)
- Brix (float, °Bx)
- Veraison date (date)
- Harvest date (date)

#### Small Fruits (Blueberry, Strawberry, Raspberry)
- Disease severity (categorical 1–5)
- Winter injury (categorical 1–5)
- Fruit set (categorical 1–5)
- Berry size (float, mm)
- Brix (float, °Bx)
- Firmness (float, N)
- Harvest date (date)

#### Tree Fruits (Apple, Peach, Cherry, Citrus)
- Scab / disease severity (categorical 0–5)
- Fire blight severity (categorical 0–5)
- Fruit size (float, mm)
- Fruit color score (categorical 1–5)
- Firmness (float, N)
- Bloom date (date)
- Harvest date (date)
- Yield (float, kg/tree)

### Clone Trial
- "Clone this trial" button on TrialDashboard
- Copies: trial config, trait list, all plots + custom attributes
- User changes: name, location, start date
- New trial starts with 0 observations, no scoring rounds (user creates rounds fresh)

### Custom Trait Builder UI
- Trait name, display label, unit (optional)
- Data type selector
- For integer/float: min value, max value, decimal places
- For categorical: add/remove/reorder category options
- Description field (shown as hint during scoring)
- Required toggle
- Preview widget shown in real time as user configures

### Trial Creation Flow (updated)
1. Trial name, location, start date
2. Select crop → preset trait pack loads → user adds/removes/reorders traits
3. "Custom crop" option: start with empty trait list, build from scratch
4. Create first scoring round
5. Import plots via CSV (custom attribute columns auto-detected)

---

## Phase 3 — Enhanced Field Navigation & Scoring UX

**Priority: Medium**

### 3a. Field Plan as Navigation Hub
- Heatmap becomes primary navigation, not just visualization
- Tap any cell → go to that plot's ObservationEntry
- Cell display: plot ID, genotype, scored/unscored/flagged status per current round
- Trait selector + round selector dropdowns
- Flagged plots shown with warning icon; border plots grayed out

### 3b. Guided Walk Modes (GridScore NEXT patterns)
Set at trial creation, changeable anytime:
- **Serpentine** — row 1 L→R, row 2 R→L (most common, continuous walking)
- **Row-by-row** — always left to right per row
- **Column-by-column** — top to bottom per column
- **Free navigation** — no enforced order, user picks from field plan
- Walk progress indicator: "47 / 240 in this round"
- Current walk mode shown in header during collection

### 3c. Swipe Navigation Between Plots
- Swipe left → next plot in walk order
- Swipe right → previous plot
- Replaces tapping "Save & Next" for experienced scorers
- Configurable: swipe triggers auto-save or prompts confirmation

### 3d. Voice Input for Numeric Traits
- Microphone button on integer/float trait inputs
- Speak a value ("one twenty" → 120, "three point five" → 3.5)
- Confirmation display before saving
- Uses browser Web Speech API (no extra dependency)
- Falls back silently if microphone unavailable

### 3e. Previous Round Score Visible
- During scoring, each trait shows the value from the most recent prior round
- Displayed as a small chip/badge next to the input: "Last: 2"
- Helps scorers track change without switching screens

### 3f. Per-Trait Progress Tracking
- Dashboard shows per-trait completion per round
- E.g., "Mildew severity: 120/240 | Brix: 45/240 | Harvest date: 0/240"
- PlotList filterable by "unscored for [specific trait] in [round]"
- Next-unscored logic respects current round + selected trait filter

### 3g. Neighbor Plot Scores (Mini Spatial Context)
- On ObservationEntry, small 3×3 grid shows current plot + immediate neighbors
- Each neighbor cell shows its latest score for the current trait
- Helps catch misidentified plots and spatial consistency errors

---

## Phase 4 — Local CNN for AI Classification

**Priority: Medium** — Biggest competitive differentiator. Replaces cloud API.

### Architecture Decision
**MobileNetV2 running on the backend (FastAPI + TensorFlow).**

Rationale:
- App is already server-based; researchers use phones that vary in capability
- MobileNetV2 is fast enough on CPU (~200ms inference on server)
- Keeps phone lightweight — no ML runtime on device
- Generalizes to multiple traits easily without re-deploying a browser bundle
- Same UX as current (upload photo → get prediction) with zero per-call API cost

### 4a. Replace Cloud API with Local CNN
- Replace Gemini/Groq calls in `ai_classifier.py` with TensorFlow inference
- MobileNetV2 base pretrained on ImageNet, fine-tuned per trait
- One model per categorical trait (e.g., ergot_severity, powdery_mildew)
- Fallback: if no trained model exists for a trait, skip AI prediction silently (no error)
- Model files stored in `backend/models/cnn/{trait_id}/model.h5`

### 4b. Training Pipeline
- Training script: `backend/scripts/train_trait_model.py`
- Input: labeled images from `backend/reference_images/{trait_id}/level_{n}/`
- Source of training data:
  1. Admin-uploaded reference images (initial seed — same as current reference images)
  2. Field photos with confirmed observations accumulate automatically as training data
- Training triggered manually by admin (CLI command or admin UI button)
- Retraining recommended when new labeled data exceeds a threshold (e.g., 50 new images)
- Output: `model.h5` + `class_labels.json` + `training_report.json` (accuracy, confusion matrix)

### 4c. Reference Image Management UI
- Admin page: browse traits → upload reference images per severity/category level
- Images auto-resize and stored in structured paths
- Shows count of images per level and training status
- "Train model" button triggers backend training job
- Training status indicator (in progress / complete / accuracy %)

### 4d. Generalized to Any Categorical Trait
- Same inference pipeline works for any trait: ergot, mildew, vigor, frost damage, etc.
- Prompt-based context: trait name + level descriptions passed to model as metadata
- Zero-shot fallback for traits without a trained model

### 4e. AI Trait Definition Assistant (Stretch)
- When user types a new crop name in trial creation, AI suggests relevant traits
- Uses a small LLM call (one-time at setup, not per-observation)
- User reviews and confirms suggestions — not auto-applied

---

## Phase 5 — Team Roles, Data Sync & Offline

**Priority: Lower**

### 5a. User Roles (Labels Only)
- Add `role` field to User: `admin` | `collector` (no permission restrictions)
- Trial dashboard shows who has scored what (collector attribution per observation)
- Observation model records `user_id` of scorer
- Role visible in Settings, changeable by user themselves

### 5b. Data Merge for Team Collection
- Each user scores independently on their own device
- Export observations as a JSON bundle (per trial, per round)
- Admin imports bundles from team members → server merges
- Conflict resolution: if same (plot, trait, round) has two values, flag for admin review
- Alternative: direct server sync once connectivity is available

### 5c. Offline-First PWA
- Service worker caches app shell
- IndexedDB stores observations made offline
- Background sync pushes pending observations when connectivity returns
- Offline indicator banner: "You are offline — observations saved locally"
- Conflict resolution: last-write-wins per (plot_id, trait_id, round_id)

### 5d. Trial Sharing via QR Code
- Export trial definition (plots + traits + rounds) as QR code / shareable JSON
- Another device imports trial → can collect data independently
- Data merged back via 5b mechanism

---

## Phase 6 — Standards & Advanced Analytics

**Priority: Lowest**

### 6a. BrAPI Integration
- Import trait definitions from BrAPI-compatible breeding databases
- Export observations in BrAPI format

### 6b. Enhanced Export
- Current: CSV wide format (one row per plot) — this is enough for Phase 1–5
- Future: long/tidy format option, per-round sheets

### 6c. Advanced Visualizations
- Cross-round trend charts (disease progression over time)
- Scatter plots between two traits
- Genotype ranking tables per trait per round

### 6d. Statistical Integration
- Export in R-ready format with template analysis script

---

## Technical Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Phase 1 touches ~20 files | Additive migration: new tables first, data migrated, old columns removed last |
| Scoring rounds + traits makes stats complex | `TraitAggregator` service class — one method per data type, one query per round |
| Heatmap color coding for non-severity traits | `TraitColorMapper` utility — auto-scale numeric, per-category colors for categorical, date-relative for dates |
| CNN model accuracy with few training images | MobileNetV2 transfer learning needs only 50–200 images per class; reference images are enough to bootstrap |
| CNN training is slow without GPU | MobileNetV2 fine-tuning on CPU takes ~5–15 min for a small dataset — acceptable for admin-triggered retraining |
| Custom plot attributes in CSV import | Auto-detect extra columns beyond the 5 fixed fields; store as PlotAttribute key/value pairs |
| Swipe gesture conflicts with scroll | Use a horizontal swipe threshold (>30px horizontal, <15px vertical) before triggering plot navigation |

---

## Files That Change Most in Phase 1

| File | Change |
|---|---|
| `backend/models.py` | Add Trait, TrialTrait, ScoringRound, PlotFlag, PlotAttribute; modify Observation |
| `backend/schemas.py` | Add schemas for all new models |
| `backend/crud.py` | Replace hardcoded validation; add trait/round/flag CRUD |
| `backend/routers/observations.py` | Require scoring_round_id + trait_id |
| `backend/routers/stats.py` | Dynamic aggregation per trait + round |
| `backend/routers/trials.py` | Include traits and rounds in responses |
| `backend/alembic/versions/` | New migration file |
| `frontend/src/types/index.ts` | Add Trait, ScoringRound, PlotFlag, PlotAttribute types |
| `frontend/src/api/client.ts` | Add all new endpoints |
| `frontend/src/pages/CreateTrial.tsx` | Multi-step with trait selection + round creation |
| `frontend/src/pages/ObservationEntry.tsx` | Dynamic widgets, round awareness, flag button |
| `frontend/src/pages/TrialDashboard.tsx` | Dynamic stats, round tabs |
| `frontend/src/pages/HeatmapView.tsx` | Trait + round selectors |
| `frontend/src/pages/PlotList.tsx` | Flag status, filter by round/trait completion |
| `frontend/src/components/SeveritySelector.tsx` | Generalize to any categorical trait |

---

## Phase 1 Implementation Sequence

1. DB schema: add Trait, TrialTrait, ScoringRound, PlotFlag, PlotAttribute models
2. Alembic migration (additive — no drops)
3. Migrate existing sorghum data: seed Trait records, assign observations to a seeded round
4. Backend: trait CRUD + dynamic validation engine
5. Backend: scoring round CRUD + round-aware next-unscored logic
6. Backend: plot flag + custom attribute endpoints
7. Backend: dynamic stats, heatmap, export (trait + round aware)
8. Frontend: update types + API client
9. Frontend: multi-step trial creation (trait selection + first round)
10. Frontend: dynamic ObservationEntry (trait widgets + round selector + flag button)
11. Frontend: dynamic stats dashboard + heatmap selectors
12. Frontend: plot list with flag status + round/trait filters
13. Seed sorghum ergot pack + other initial crop packs
