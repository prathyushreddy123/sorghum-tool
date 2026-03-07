# SorghumField — Issues & Troubleshooting Log

Complete history of issues encountered and resolved across all development sessions, organized chronologically by phase.

---

## Phase 1: MVP Development (Feb 7, 2026)

### ISS-001: TypeScript strict mode — unused variables block build

**Symptom:** `npx tsc --noEmit` fails with `TS6133: 'X' is declared but its value is never read`.

**Root cause:** Unused imports left after refactoring (e.g., `import { api }` in `CreateTrial.tsx`). TypeScript strict mode treats these as errors.

**Fix:** Remove all unused imports before building. Vercel runs `tsc` during deploy, so this blocks production.

**Files:** `CreateTrial.tsx`, `TeamManagement.tsx`, various others over time.

---

### ISS-002: Tailwind v4 color config different from v3

**Symptom:** Custom colors (`primary`, `primary-light`, etc.) not applying.

**Root cause:** Tailwind CSS v4 uses `@theme {}` block in `index.css` instead of `tailwind.config.js`. Also uses `@tailwindcss/vite` plugin instead of PostCSS.

**Fix:** Define colors in `src/index.css` under `@theme { --color-primary: #2E7D32; ... }`.

---

## Phase 2: UI Redesign & Features (Feb 8, 2026)

### ISS-003: Nested interactive elements — button inside button

**Symptom:** Plot cards with delete icons cause React hydration warnings and accessibility issues.

**Root cause:** Plot card was a `<button>` wrapping another `<button>` (delete icon). HTML spec forbids interactive elements nested inside other interactive elements.

**Fix:** Changed plot card from `<button>` to `<div>` wrapper with `onClick`, kept delete as a separate `<button>`.

**File:** `PlotList.tsx`

---

### ISS-004: Stats not refreshing after scoring

**Symptom:** Dashboard stats (progress bar, counts) are stale after returning from scoring plots.

**Root cause:** Dashboard fetched stats on mount but not on window focus. When user scores plots in ObservationEntry and navigates back, the cached stats were displayed.

**Fix:** Added `window.addEventListener('focus', refetchStats)` to `TrialDashboard.tsx`.

---

## Phase 3: Authentication & Deployment (Feb 2026)

### ISS-005: Auth endpoints returning 500 (Internal Server Error)

**Symptom:** `POST /auth/login` and `POST /auth/register` return plain-text "Internal Server Error".

**Root cause:** Two compounding issues:
1. `render_as_batch=True` in `alembic/env.py` is a SQLite workaround that DROPs + RECREATEs tables. On PostgreSQL, this fails silently because FK constraints prevent dropping `users` table. Migrations rolled back, leaving columns never created.
2. Starlette's `BaseHTTPMiddleware` wraps exceptions as plain-text, hiding tracebacks from logs.

**Fix:**
- Set `render_as_batch` conditionally — `True` only for SQLite, `False` for PostgreSQL.
- Manually applied missing columns via SQL `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Made all migrations idempotent with `has_table()` and `information_schema.columns` guards.
- Added global FastAPI exception handler logging full tracebacks.
- Added `/health/db` diagnostic endpoint.

**Diagnosis:**
```bash
curl https://your-api.com/health/db
```

---

### ISS-006: SECRET_KEY regenerated on every deploy — all users logged out

**Symptom:** Every deployment signs out all users.

**Root cause:** `deploy.sh` generated a new random `SECRET_KEY` each run. JWTs signed with the old key become invalid.

**Fix:** `deploy.sh` reads `SECRET_KEY` from `.env.deploy` if present. Only generates a new one if missing.

---

### ISS-007: passlib dependency issues with bcrypt

**Symptom:** `passlib` fails to hash passwords on certain Python versions.

**Root cause:** `passlib` has compatibility issues with newer `bcrypt` versions.

**Fix:** Replaced `passlib` with direct `bcrypt` usage for password hashing.

**Commit:** `da6474a`

---

### ISS-008: `%` in DATABASE_URL breaks Alembic

**Symptom:** Alembic `env.py` crashes when parsing PostgreSQL connection strings containing `%` characters (e.g., password with special chars).

**Root cause:** `ConfigParser` interprets `%` as interpolation syntax.

**Fix:** Escape `%` as `%%` in the DATABASE_URL before passing to Alembic config.

**Commit:** `da72d93`

---

### ISS-009: Railway $PORT not expanding in Procfile

**Symptom:** Backend fails to start on Railway — uvicorn binds to literal `$PORT` string.

**Root cause:** Procfile command `uvicorn main:app --port $PORT` doesn't expand `$PORT` without a shell wrapper.

**Fix:** Wrap uvicorn start command in `sh -c` for proper environment variable expansion.

**Commit:** `7b745fa`

---

## Phase 4: Performance & Offline (Feb 2026)

### ISS-010: N+1 query performance — slow list pages

**Symptom:** Trial list and plot list load slowly (seconds) even for small datasets.

**Root cause:** 2 extra DB queries per trial (total/scored count) and 1 extra query per plot (has_observations check).

**Fix:**
- `crud.get_trial_plot_counts_bulk()`: 2 GROUP BY queries for all trials at once.
- `crud.get_plots_observed_set()`: 1 query returning all observed plot IDs.
- Added DB indexes on `plots.trial_id`, `observations.plot_id`, composite on `(plot_id, scoring_round_id)`.

**Commit:** `21bf42a`

---

### ISS-011: Pages take minutes to load through Cloudflare tunnel

**Symptom:** Local dev via `trycloudflare.com` takes 2-5 minutes per page.

**Root cause:** `React.lazy` + Vite dev server = separate HTTP request per ES module. With ~150ms tunnel latency per request and 10+ lazy chunks, the waterfall compounds to minutes.

**Fix:** Changed `start.sh` to use `vite build` + `vite preview` (production bundle) instead of `vite --host` (dev server).

---

### ISS-012: Plots loading >1 minute on production

**Symptom:** Trial plot list blocks for 30-60+ seconds.

**Root cause:** `offlineApi.getPlots()` always waited for full API response. No stale-while-revalidate pattern like `getTrials()`.

**Fix:** Applied stale-while-revalidate to `getPlots()` — return IndexedDB cache instantly, refresh in background. Added `_fetchAndCachePlots()` helper.

**File:** `frontend/src/db/offlineApi.ts`

---

### ISS-013: "Offline — no cached plots" when clicking Resume

**Symptom:** Resume card shows error even when online.

**Root cause:** `prefetchTrialForOffline()` used `Promise.all()` — if ANY of 4 parallel API calls failed, nothing was cached.

**Fix:** Replaced `Promise.all()` with `Promise.allSettled()` so partial successes get cached.

---

### ISS-014: All users see all trials (no per-user filtering)

**Symptom:** Every user sees every trial in the database.

**Root cause:** `get_current_user()` returns `None` for unauthenticated requests (auto_error=False). When both `user_id=None` and `team_id=None`, no filter applied → all trials returned.

**Fix:** Added `else: return []` in `crud.get_trials()`.

---

### ISS-015: Deleting trials leaves stale IndexedDB cache

**Symptom:** Deleted trials reappear with their plot counts due to stale cache.

**Root cause:** No `deleteTrial()` function in `offlineApi.ts`. Cached plots, scoring rounds, and trial traits persisted.

**Fix:** Added `deleteTrial(trialId)` cascade delete in IndexedDB. Called after API deletion succeeds.

---

### ISS-016: ObservationEntry loads slowly (multiple seconds)

**Symptom:** "Loading..." spinner for several seconds on each plot entry.

**Root cause:** `offlineApi.getTrial()` always waited for API (no stale-while-revalidate). Since it runs first in `loadData()`, it blocked all subsequent parallel calls.

**Fix:** Converted `getTrial()` to stale-while-revalidate pattern.

---

### ISS-017: Offline prefetch fires 240+ API calls

**Symptom:** Hundreds of slow API calls: `GET /plots/{id}/observations?round_id=2` repeated per plot.

**Root cause:** `prefetchTrialForOffline()` fetched observations for each plot individually via `Promise.all(plots.map(...))`. 240 plots = 240 parallel HTTP requests.

**Fix:**
- Backend: Added `GET /trials/{trial_id}/observations?round_id=` endpoint (single SQL query via JOIN).
- Frontend: Updated to call `api.getTrialObservations(trialId, roundId)` — one request.

**Commit:** `623135e`

---

### ISS-018: PostgreSQL connection pool exhaustion

**Symptom:** Database errors under load on Railway/Supabase.

**Root cause:** Default SQLAlchemy pool settings not tuned for PostgreSQL. No `pool_pre_ping` to detect stale connections.

**Fix:** Added `pool_pre_ping=True` and connection pool limits for PostgreSQL.

**Commit:** `83b8409`

---

## Phase 5: AI Classification (Feb-Mar 2026)

### ISS-019: AI severity classification silent failure after photo upload

**Symptom:** Photo uploads successfully but no AI prediction appears — no spinner, no result, no error.

**Root cause:** Two issues:
1. `GEMINI_API_KEY` was in `.env.deploy` but never passed to Cloud Run environment variables. Backend had `AI_CLASSIFICATION_ENABLED=true` but no key → Gemini returned `None`, Groq also `None` → 503.
2. Frontend `handleImageUploaded` had a bare `catch {}` that silently discarded the 503 error.

**Fix:**
- Added `GEMINI_API_KEY` to Cloud Run env vars.
- Replaced bare `catch {}` with error handling showing failure to user.
- Added null-response guard for Gemini safety-blocked responses.
- Created `backend/.env` with Gemini key for local dev.

---

### ISS-020: `disease_severity_general` picked over specific trait models

**Symptom:** When trial has `ergot_severity`, the AI pipeline picks `disease_severity_general` instead, which fails because its model is generic.

**Root cause:** `findTraitForPhoto` iterated through traits and picked the first AI-supported one. `disease_severity_general` appeared before `ergot_severity` in the trait list.

**Fix:** Added `GENERIC_TRAITS` set (`disease_severity_general`, `sorghum_disease_type`) and deprioritization logic in `findTraitForPhoto()` — specific traits (e.g., `ergot_severity`, `rust_severity`) are always preferred.

**File:** `frontend/src/pages/ObservationEntry.tsx`

**Commit:** `350aa19`

---

### ISS-021: Disease ID model silently falls back to wrong trait

**Symptom:** Uploading an anthracnose photo shows ergot severity result. Disease identification is failing silently.

**Root cause:** When disease ID model fails or returns a disease not matching any trial trait, the fallback silently picks the first available AI trait (usually `ergot_severity`).

**Fix:** When disease ID succeeds but the matching trait isn't in the trial, show an explicit warning: "Anthracnose detected, but this trial has no anthracnose_severity trait." Don't silently fall back to a mismatched trait.

**File:** `frontend/src/pages/ObservationEntry.tsx`

**Commit:** `4e5215b`

---

### ISS-022: ONNX models have external weights — browser can't load them

**Symptom:** Models download (304 response) but are only ~340KB. Inference fails or produces garbage results.

**Root cause:** PyTorch ONNX export splits large models into two files:
- `.onnx` — computation graph only (~340KB)
- `.fp32.onnx.data` — weights (~12MB, external data file)

ONNX Runtime Web expects a single self-contained `.onnx` file. The browser downloads just the graph without weights.

**Affected models:** All 5 — `sorghum_disease_type.onnx`, `anthracnose_severity.onnx`, `disease_severity_general.onnx`, `grain_mold_severity.onnx`, `rust_severity.onnx`.

**Fix:** Merge external data into single file:
```python
import onnx
model = onnx.load("model.onnx", load_external_data=True)
onnx.save_model(model, "model_merged.onnx", save_as_external_data=False)
```

Re-uploaded all 5 merged models (~12.6MB each) to Supabase.

**Commits:** `ed7c3fd`, `a36ae4c`

**Prevention:** Training script should always merge external data before saving:
```python
# After torch.onnx.export(...)
import onnx
model = onnx.load(output_path, load_external_data=True)
if model.graph.initializer and any(
    init.data_location == onnx.TensorProto.EXTERNAL for init in model.graph.initializer
):
    onnx.save_model(model, output_path, save_as_external_data=False)
```

---

### ISS-023: INT8 quantization fails for MobileNetV3 custom head

**Symptom:** `ShapeInferenceError` during ONNX quantization step.

**Root cause:** ONNX Runtime's INT8 quantizer can't handle MobileNetV3's custom classifier head (Linear → Hardswish → Dropout → Linear). Shape inference fails on the non-standard activation functions.

**Fix:** Fall back to FP32 (unquantized) models. Size is ~12.6MB per model instead of ~340KB, but works reliably. The training script has a try/except that falls back to FP32 when quantization fails.

**File:** `backend/scripts/train_disease_models.py`

---

### ISS-024: Supabase CDN caching old model files (304 Not Modified)

**Symptom:** After uploading a new model to Supabase, browsers still get the old model (304 response, 0.6KB).

**Root cause:** Supabase/Cloudflare CDN caches files aggressively. Same URL = same cached response even if the underlying file changed.

**Fix options:**
1. **New filename:** Upload as `sorghum_disease_type_v2.onnx` and update manifest URL.
2. **Query parameter cache bust:** Append `?v=2-7class` to the URL.
3. **Re-upload to same URL:** Supabase eventually invalidates cache (~minutes to hours).

**Used approach:** Re-uploaded merged models to same URLs. For urgent changes, use new filenames.

**Commit:** `06459e2`

---

### ISS-025: CLIP text embedding JSON files returning 404

**Symptom:** Network tab shows 400/404 errors for `clip-embeddings/disease_severity_general.json`, `rust_severity.json`, etc.

**Root cause:** CLIP text embeddings were only generated for the original 5 traits. When new traits were added to the manifest (`disease_severity_general`, `rust_severity`, `grain_mold_severity`, `covered_smut_severity`, `head_smut_severity`, `loose_smut_severity`), no corresponding embedding files were created.

**Fix:** Generated missing embeddings using the same text-to-embedding approach from `export_clip.py`. Created 6 new JSON files in `frontend/public/models/clip-embeddings/`.

**Commit:** `8624afb`

---

### ISS-026: ONNX Runtime cross-origin issues loading models from Supabase

**Symptom:** `ort.InferenceSession.create(url)` fails intermittently when loading models from Supabase CDN.

**Root cause:** ONNX Runtime Web's built-in URL fetcher may not handle cross-origin requests properly in all browsers. It expects CORS headers that Supabase may not always provide.

**Fix:** Fetch the model as an `ArrayBuffer` first using standard `fetch()`, then pass the buffer to `ort.InferenceSession.create(buffer)`:
```typescript
const res = await fetch(modelUrl);
const buffer = await res.arrayBuffer();
const session = await ort.InferenceSession.create(buffer, {
  executionProviders: ['wasm'],
  graphOptimizationLevel: 'all',
});
```

**File:** `frontend/src/services/modelManager.ts`

**Commit:** `aa3a58a`

---

### ISS-027: AI warnings/errors shown at bottom of page, not near photo

**Symptom:** When AI classification fails or detects a disease not in the trial, the warning appears in the generic error bar at the very bottom of the page. User doesn't see it.

**Root cause:** All AI pipeline errors were using the shared `setError()` state, which renders in a fixed error bar at the bottom of the ObservationEntry page.

**Fix:** Created separate `aiWarning` state. AI-specific warnings display inside the "AI Disease Analysis" card, directly below the uploaded photo. Shows disease identification result + warning text together.

**File:** `frontend/src/pages/ObservationEntry.tsx`

**Commit:** `3fcdede`

---

### ISS-028: Ergot not in disease identification model

**Symptom:** Uploading an ergot-infected photo doesn't identify "Ergot" — model only has 6 classes from the Mendeley dataset.

**Root cause:** The original Mendeley Sorghum Disease Dataset didn't include Ergot. The disease ID model was trained on 6 classes: Anthracnose, Cereal Grain Molds, Covered Kernel Smut, Head Smut, Rust, Loose Smut.

**Fix:** Retrained `sorghum_disease_type` with 7 classes using 83 user-provided Ergot images. Accuracy: 98.9% (7 classes) vs 99.2% (6 classes). Added `'ergot': 'ergot_severity'` to `DISEASE_TO_TRAIT` mapping.

**Dataset:** `/mnt/c/Users/prath/OneDrive/Desktop/sorghum-tool/Sorghum Disease Image Dataset/Ergot/` (83 images)

**Commit:** `1e4d5fe`

---

### ISS-029: Vertex AI project suspended — can't label severity data

**Symptom:** Gemini API calls via Vertex AI fail with `CONSUMER_SUSPENDED`. Google AI Studio free tier limited to 20 requests/day.

**Root cause:** GCP project `sorghum-tool` free trial expired. Project status changed to `CONSUMER_SUSPENDED`. Google AI Studio free tier has strict rate limits (20 requests/day per model for Gemini 2.5 Flash).

**Impact:** Can't auto-label the 83 ergot images for severity training. Disease ID model deployed without ergot-specific severity model.

**Workarounds:**
1. Reactivate GCP billing (add payment method).
2. Manual labeling of 83 images (feasible given small count).
3. Use Groq free tier (Llama 4 Scout) for labeling.
4. Wait and batch-label when credits are available.

**Status:** Disease ID deployed with 7 classes. Ergot severity uses `ergot-severity-v1.onnx` (separately trained earlier).

---

### ISS-030: `head_smut_severity` classification failure — "no local model and no API connection"

**Symptom:** Uploading a head smut photo shows: "AI prediction failed: Classification unavailable for head_smut_severity: no local model and no API connection."

**Root cause:** `head_smut_severity` uses `disease_severity_general.onnx` as its Tier 1 model. This model had the external weights issue (ISS-022) — the browser downloaded only the 340KB graph, not the 12MB weights. Tier 2 (CLIP) also failed because the embedding JSON was missing (ISS-025). Tier 3 (cloud LLM) requires API keys that weren't configured.

**Fix:** Addressed by fixing ISS-022 (merged ONNX files) and ISS-025 (generated CLIP embeddings). All three tiers should now work for `head_smut_severity`.

---

## Phase 6: Smart AI Photo Flow (Mar 3, 2026)

### ISS-031: State refactor broke old `aiResult` references

**Symptom:** TypeScript errors after changing from `aiResult` (single) to `aiResults` (multi-result Record).

**Root cause:** Refactored AI state from `useState<{traitId, value, confidence} | null>` to `useState<Record<number, {...}>>({})`. Several places still referenced the old `aiResult` and `setAiResult`.

**Fix:** Updated all references:
- `setAiResult(null)` → `setAiResults({})`
- `aiResult?.traitId` → `aiResults[tt.trait_id]`
- JSX rendering updated for multi-result display

**Commit:** `4a677ac`

---

### ISS-032: `tt.trait.options` TypeScript error

**Symptom:** `Property 'options' does not exist on type 'Trait'`.

**Root cause:** Trait type uses `category_labels` (JSON string field) not `options`. The training sample submission code tried to access `tt.trait.options`.

**Fix:** Changed to `JSON.parse(tt.trait.category_labels)`.

---

## Phase 7: Email Verification & Offline Images (Mar 2026)

### ISS-033: Migration uses SQLite boolean syntax — fails on PostgreSQL

**Symptom:** Backend fails to start on Railway after deploying email verification feature. Frontend shows "Failed to fetch" on all API calls.

**Root cause:** Alembic migration `j0e1f2g3h4i5` used SQLite-style boolean values:
- `server_default=sa.text("0")` — PostgreSQL rejects integer `0` for BOOLEAN columns
- `UPDATE users SET email_verified = 1` — PostgreSQL requires `true`/`false`

This happened because the migration was written in a local dev environment that uses SQLite, then deployed to Railway which runs PostgreSQL.

**Fix:** Changed to PostgreSQL-compatible boolean literals:
- `server_default=sa.text("false")`
- `UPDATE users SET email_verified = true`

**Lesson:** Always use `true`/`false` (not `0`/`1`) in Alembic migrations to maintain SQLite + PostgreSQL compatibility. PostgreSQL accepts `true`/`false`, and SQLite also accepts them.

**Commit:** `6ab1d61`

---

### ISS-034: Registration hangs indefinitely — "Loading please wait" forever

**Symptom:** Clicking Register shows loading spinner that never completes. Request times out after several minutes.

**Root cause:** The `POST /auth/register` endpoint sends a verification email synchronously before returning. `smtplib.SMTP(host, port)` has **no default timeout** — if the SMTP server is configured but unreachable (e.g., `SMTP_HOST` is set on Railway but the mail server doesn't respond), the connection attempt blocks forever, hanging the entire request.

**Fix:**
1. Added `timeout=10` to `smtplib.SMTP()` call — caps email sending at 10 seconds
2. Wrapped verification email in `try/except` — registration completes even if email fails
3. Same fix applied to resend-verification endpoint

**Note on SMTP:** If `SMTP_HOST` is not set (empty string), the email service skips SMTP entirely and just logs to console. The hang only occurs when `SMTP_HOST` is set but the server is unreachable. For now, email verification works as a soft gate — users get a 24h grace period regardless of whether the email is delivered.

**Commit:** `111161b`

---

### ISS-035: Email verification not required for current deployment

**Symptom:** Not a bug — documentation of a design decision.

**Context:** Email verification is implemented as a **soft gate**: users can use the app for 24 hours without verifying. After 24h, if they have pending sync data, the grace auto-extends by another 24h. Existing users were grandfathered as `email_verified=true` in the migration.

**SMTP setup (optional):** To enable actual verification emails, configure these env vars on Railway:
```
SMTP_HOST=smtp.resend.com    (or smtp.gmail.com, smtp.sendgrid.net)
SMTP_PORT=587
SMTP_USER=<username>
SMTP_PASSWORD=<password>
SMTP_FROM_EMAIL=noreply@yourdomain.com
```

Without SMTP configured, the system works fine — just no emails are sent. Verification can be done manually via Supabase SQL editor:
```sql
UPDATE users SET email_verified = true WHERE email = 'user@example.com';
```

---

## Debugging Cheatsheet

### Backend

| Problem | Command |
|---------|---------|
| 500 errors on Railway | Check Railway logs dashboard |
| DB schema issues | `GET /health/db` or connect to Supabase SQL editor |
| Migration stuck | `SELECT * FROM alembic_version` in Supabase; manually stamp |
| Slow API calls | Enable `DEBUG_QUERIES=1` env var; check `[SLOW API]` in browser console |
| AI classification errors | Check `AI_CLASSIFICATION_ENABLED`, `GEMINI_API_KEY`, `GROQ_API_KEY` env vars |

### Frontend

| Problem | Where to look |
|---------|---------------|
| Models not loading | Browser console → `[modelManager]` logs; Network tab → check ONNX file sizes |
| ONNX model too small (~340KB) | External data issue — model needs merging (see ISS-022) |
| CLIP embeddings 404 | Check `frontend/public/models/clip-embeddings/` has JSON for each trait |
| AI shows wrong trait | Check `DISEASE_TO_TRAIT` mapping and `GENERIC_TRAITS` in ObservationEntry.tsx |
| Stale models after upload | CDN caching — use new filename or wait for invalidation |
| Build fails on Vercel | Usually unused imports (TS6133) — remove them |
| IndexedDB stale data | Call `clearAll()` or clear browser storage |

### Model Training

| Problem | Solution |
|---------|----------|
| ONNX has external weights | `onnx.save_model(model, path, save_as_external_data=False)` |
| INT8 quantization fails | Fall back to FP32 (training script does this automatically) |
| Vertex AI suspended | Reactivate GCP billing or use Google AI Studio free tier |
| Class imbalance (low accuracy) | Check per-class counts; use `WeightedRandomSampler`; add more data for minority classes |

### Key Log Prefixes in Browser Console

```
[modelManager]     — Manifest fetch, model download, model creation
[classifierService] — Per-tier classification attempts and results
[AI]               — Disease ID pipeline, trait mapping, auto-fill
[offlineApi]       — IndexedDB cache hits/misses, API calls
[SLOW API]         — API calls taking >500ms
```

### Environment Variables Reference

**Backend (Railway):**
```
DATABASE_URL          — PostgreSQL connection string
GEMINI_API_KEY        — Google Gemini API key (Tier 3 classification)
GROQ_API_KEY          — Groq API key (Tier 3 fallback)
AI_CLASSIFICATION_ENABLED — "true" to enable cloud AI endpoint
RUNPOD_ENDPOINT_ID    — RunPod serverless endpoint for training
RUNPOD_API_KEY        — RunPod authentication
TRAINING_CALLBACK_SECRET — Secret for training job callbacks
RAILWAY_PUBLIC_URL    — Public URL for callbacks
SECRET_KEY            — JWT signing key (keep stable across deploys!)
SMTP_HOST             — SMTP server (empty = dev mode, no emails sent)
SMTP_PORT             — SMTP port (default 587)
SMTP_USER             — SMTP username
SMTP_PASSWORD         — SMTP password
SMTP_FROM_EMAIL       — Sender email address
FRONTEND_URL          — Frontend URL for email links (e.g., https://your-app.vercel.app)
```

**Frontend (Vercel):**
```
VITE_API_BASE         — Backend API URL (e.g., https://your-app.up.railway.app)
VITE_MANIFEST_URL     — Model manifest URL (default: /models/manifest.json)
VITE_MODELS_BASE_URL  — Base URL for ONNX models (optional, uses manifest URLs)
```
