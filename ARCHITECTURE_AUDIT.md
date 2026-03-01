# Architecture Audit & Troubleshooting — Feb 28, 2026

## Part 1: Session Troubleshooting Log

### 1.1 AI Review Queue Feature (Implemented)

**Goal:** Track when AI misclassifies images so admin can review and retrain.

**What was built:**

| Layer | Change | File |
|-------|--------|------|
| DB | Added `ai_predicted_value`, `ai_confidence` columns to `training_samples` | `backend/models.py:211-212` |
| Migration | `g7b8c9d0e1f2_add_ai_prediction_tracking.py` | `backend/alembic/versions/` |
| Schema | `TrainingSampleCreate` accepts AI prediction data; new `ReviewQueueItem` schema | `backend/schemas.py:343-370` |
| API | `GET /training/review-queue` — admin-only, filterable by trait | `backend/routers/training.py:114-145` |
| Frontend | Training sample submission now detects user override vs AI confirm | `frontend/src/pages/ObservationEntry.tsx:330-358` |
| Frontend | Review Queue section with thumbnails in TrainingDashboard | `frontend/src/pages/TrainingDashboard.tsx` |
| Frontend | `/settings/training` route locked to admin-only via `AdminRoute` wrapper | `frontend/src/App.tsx:29-34, 64` |
| Types | `ReviewQueueItem` interface, updated `submitTrainingSample` signature | `frontend/src/types/index.ts`, `frontend/src/api/client.ts` |

**How it works:**
- When scoring a plot, if AI suggested value X but user saves value Y → source = `user_corrected`, stores AI's prediction
- If user agrees with AI → source = `ai_confirmed`
- If no AI was involved → source = `user_label`
- Admin sees all `user_corrected` samples in the Review Queue with image thumbnail, AI prediction (struck through), and user's correction

**Verified via API tests:**
- `POST /training/samples` with `source=user_corrected` → stores correctly
- `GET /training/review-queue` → returns only `user_corrected` items with image metadata
- `GET /training/review-queue` without auth → 401
- `GET /training/review-queue?trait_name=X` → filters correctly
- `ai_confirmed` samples do NOT appear in queue

### 1.2 Cloudflare Tunnel Issues

**Problem:** Could not access app via Cloudflare quick tunnels from browser.

**Investigation:**
1. Two quick tunnels started: backend (port 8000) and frontend (port 3000)
2. Both tunnels registered successfully with Cloudflare edge (ATL location)
3. `curl` from within WSL failed with "Could not resolve host" — this is a **WSL DNS limitation**, not a tunnel issue
4. `~/.cloudflared/config.yaml` had a named tunnel config (`job-tool`) that may have interfered with quick tunnels
5. After moving config aside and restarting, tunnels registered but DNS still unresolvable from WSL

**Root cause:** WSL2's DNS resolver cannot resolve `*.trycloudflare.com` domains. The tunnels work but can only be tested from the Windows host browser, not from within WSL.

**Resolution:** Reverted `VITE_API_BASE` back to `http://localhost:8000` for local development. Cloudflare tunnel setup needs to be tested from Windows browser or use the named tunnel (`api.pattyworkflows.org`) with proper DNS.

**Config notes:**
- Named tunnel `job-tool` maps `api.pattyworkflows.org → localhost:8000` but has 0 active connections
- Named tunnel `pattyworkflows_tunnel` is active but runs from a separate Windows machine
- Frontend Vite config already allows `*.trycloudflare.com` hosts: `vite.config.ts: allowedHosts`

---

## Part 2: Current Image Storage Architecture

### Uploaded Images (User Photos)
- **Location:** `backend/uploads/` (local) or GCS bucket (if `GCS_BUCKET` env set)
- **Naming:** UUID hex filenames (`{uuid4.hex}.{ext}`)
- **Serving:** `GET /images/{filename}` — returns FileResponse (local) or redirects to signed URL (GCS)
- **Limits:** 5MB max, JPEG/PNG/WebP/HEIC/HEIF
- **Storage service:** `backend/services/storage.py` — `LocalStorage` and `GCSStorage` classes
- **Currently:** 4 images in local uploads, all JPEG

### Reference Images (Training)
- **Location:** `backend/reference_images/{trait_name}/` (e.g., `ergot_severity/`)
- **Naming:** `severity_{value}_{letter}.{ext}` (e.g., `severity_3_a.jpg`)
- **Management:** Admin-only upload/delete via `/training/reference-images/` endpoints

### Training Samples (Labels)
- **Table:** `training_samples` — links `image_id` to `trait_name` + `value`
- **Sources:** `user_label`, `ai_confirmed`, `user_corrected`
- **Export:** CSV via `GET /training/export`

---

## Part 3: Critical Data Isolation Vulnerabilities

### Summary

**The app has no backend ownership checks on most endpoints.** The trial list is filtered by user/team, but once you have a trial ID, all downstream resources (plots, observations, images) are accessible without authorization.

### Vulnerability Matrix

| Endpoint | Auth Required | Ownership Check | Severity |
|----------|:---:|:---:|:---:|
| `GET /trials` | Optional | Partial (filters by user/team) | Medium |
| `GET /trials/{id}` | NO | NO | **CRITICAL** |
| `GET /trials/{id}/plots` | NO | NO | **CRITICAL** |
| `POST /trials/{id}/plots/import` | NO | NO | **CRITICAL** |
| `DELETE /trials/{id}/plots/{id}` | NO | NO | **CRITICAL** |
| `GET /plots/{id}/observations` | NO | NO | **CRITICAL** |
| `POST /plots/{id}/observations/bulk` | NO | NO | **CRITICAL** |
| `GET /images/{filename}` | NO | NO | **HIGH** |
| `POST /plots/{id}/images` | Optional | NO | **CRITICAL** |
| `DELETE /images/{id}` | NO | NO | **CRITICAL** |
| `GET /training/review-queue` | Admin | YES | OK |
| `POST /training/jobs` | Admin | YES | OK |

### Specific Bug Reported

**Symptom:** When logging in as User B, briefly seeing trials created by User A. Refresh removes trials but plots still visible in dashboard.

**Root causes:**
1. **IndexedDB cache not cleared on user switch** — `offlineApi.ts` calls `db.trials.clear()` only when fresh data arrives; stale data from previous user may flash briefly
2. **`GET /trials/{id}` has no auth** — if the frontend cached a trial ID from User A, it can still fetch that trial's data as User B
3. **Plot/observation endpoints have no ownership checks** — any plot ID works regardless of who's logged in

### Attack Scenario
```
User A creates Trial 1 with plots and observations
User B logs in
User B calls: GET /trials/1         → Gets trial details (no auth check)
User B calls: GET /trials/1/plots   → Gets all plots (no auth check)
User B calls: GET /plots/5/observations → Gets data (no auth check)
User B calls: GET /images/abc123.jpg    → Downloads photo (no auth check)
```

---

## Part 4: Recommended Architecture for Scale

### 4.1 Data Isolation (Must Fix First)

**Strategy: Authorization middleware that validates resource ownership**

```
Every request → Authenticate user → Resolve resource chain → Verify ownership
                                     Trial → user_id/team_id matches?
                                     Plot → belongs to authorized trial?
                                     Image → belongs to authorized plot?
```

**Implementation approach:**
- Add `get_authorized_trial(trial_id, user)` dependency that returns trial only if user owns it or is a team member
- All plot/observation/image endpoints chain through this dependency
- Clear IndexedDB on logout and on user change (compare stored user ID)

### 4.2 Image Storage for Scale

**Current:** Local filesystem — single server, no redundancy, no CDN.

**Recommended:** Object storage with CDN
- **Storage:** S3-compatible (AWS S3, GCS, or Cloudflare R2)
- **Serving:** Signed URLs with short TTL (enforces auth) or CDN with token auth
- **Organization:** `{team_id}/{trial_id}/{plot_id}/{uuid}.{ext}`
- **Backup:** Cross-region replication for critical training data

### 4.3 Multi-User / Multi-Crop Scale

**Current:** Single SQLite database, single process.

**For scale:**
| Component | Current | Recommended |
|-----------|---------|-------------|
| Database | SQLite | PostgreSQL (Neon, Supabase, or RDS) |
| File storage | Local disk | S3/GCS/R2 + CDN |
| Backend | Single uvicorn | Multiple workers behind load balancer |
| Training | In-process | Background job queue (Celery/Redis or Cloud Tasks) |
| Auth | JWT (single secret) | JWT with refresh tokens + key rotation |
| Cache | IndexedDB only | Redis for API cache + IndexedDB for offline |

### 4.4 Training Pipeline at Scale

**Current:** Training runs in-process on the same server.

**For many users, crops, traits, images:**
- **Training data:** Store in object storage, not local filesystem
- **Job queue:** Async training jobs via Celery + Redis (or Cloud Run Jobs)
- **GPU:** Train on cloud GPU instances (Lambda, RunPod, or GCP GPU VMs)
- **Model registry:** Version models with metadata (accuracy, training data hash, trait, date)
- **Per-team models:** Each team's training data is siloed; models trained on team's data only
- **Reference images:** Move to object storage, organized by `{trait_name}/{value}/`

### 4.5 Latency & Reliability

- **API:** Response time < 200ms for reads, < 500ms for writes
- **AI classification:** Tiered (in-browser ONNX < 100ms → cloud API < 2s)
- **Offline-first:** IndexedDB cache + service worker for field conditions
- **Image upload:** Background upload queue with retry (already partially implemented)
- **Health checks:** `/health` endpoint for uptime monitoring
- **Error tracking:** Sentry or similar for both frontend and backend
