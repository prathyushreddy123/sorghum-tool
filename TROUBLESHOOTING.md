# FieldScout Troubleshooting Guide

## Production Issues

---

### 1. Auth endpoints returning 500 (Internal Server Error)

**Symptom:** `POST /auth/login` and `POST /auth/register` return plain-text "Internal Server Error". Other DB-hitting endpoints like `GET /trials` also fail. Only endpoints that short-circuit before touching the DB (e.g. `GET /auth/me` with no token → 401) succeed.

**Root cause:** Two compounding issues:

1. `render_as_batch=True` in `alembic/env.py` is a SQLite workaround that tells Alembic to DROP + RECREATE tables when adding columns. On PostgreSQL this fails silently because the `users` table can't be dropped — `trials.user_id` has a FK constraint pointing to it. The migration transaction rolled back entirely, leaving `users.role` (and other columns) never created.

2. Starlette's `BaseHTTPMiddleware` wraps unhandled Python exceptions as plain-text "Internal Server Error", hiding the actual traceback from logs.

**Fix:**
- `alembic/env.py`: Set `render_as_batch` conditionally — `True` only for SQLite, `False` for PostgreSQL.
- Manually applied missing columns to Neon via SQL (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) and stamped `alembic_version` to `e5f6a7b8c9d0`.
- Made all migrations idempotent: guard `CREATE TABLE` with `has_table()` checks and `ADD COLUMN` with `information_schema.columns` checks so re-runs don't fail.
- Added a global FastAPI exception handler in `main.py` that logs full tracebacks to Cloud Run logs.
- Added `/health/db` endpoint for diagnosing DB connectivity.

**How to diagnose in future:**
```bash
# Check which columns are missing
curl https://fieldscout-api-kmly3zrsea-ue.a.run.app/health/db

# Check DB schema directly
python3 -c "
from sqlalchemy import create_engine, inspect, text
engine = create_engine('$DATABASE_URL')
print(inspect(engine).get_table_names())
print([c['name'] for c in inspect(engine).get_columns('users')])
with engine.connect() as c: print(c.execute(text('SELECT * FROM alembic_version')).fetchall())
"
```

---

### 2. Pages taking multiple minutes to load through Cloudflare tunnel

**Symptom:** Local development via Cloudflare tunnel (`trycloudflare.com`) takes 2–5 minutes to load any page after the initial landing page loads.

**Root cause:** React.lazy + Vite dev server. Vite dev mode serves each ES module as a separate HTTP request. With ~150ms round-trip latency per tunnel request and 10+ lazy-loaded page chunks, initial load time multiplies: 10 chunks × 150ms = 1.5s minimum, but with waterfalls it compounds to minutes.

**Fix:** Changed `start.sh` to use `vite build` (production bundle) + `vite preview` instead of `vite --host` (dev server). Production build bundles all lazy chunks into single files, eliminating the waterfall.

---

### 3. Backend fails to restart — "Address already in use" on port 8000

**Symptom:** Running `./start.sh` after `./stop.sh` fails with `OSError: [Errno 98] Address already in use`.

**Root cause:** `stop.sh` sent SIGTERM to the uvicorn process but returned before the port was actually freed. The OS takes a moment to release the socket even after the process exits.

**Fix:** Added a wait loop to `stop.sh` that polls `lsof -ti :8000` until the port is free (up to 5 seconds) before returning.

---

### 4. Vercel build failing with TypeScript errors

**Symptom:** Vercel deployment fails with `error TS6133: 'X' is declared but its value is never read`.

**Root cause:** Unused imports (`import { api }` in `CreateTrial.tsx`, `import type { Team }` in `TeamManagement.tsx`) that TypeScript's strict mode flags as errors in production builds.

**Fix:** Removed the unused imports from both files.

---

### 5. SECRET_KEY regenerated on every deploy — all users logged out

**Symptom:** After each `./deploy.sh` run, all logged-in users are signed out and must re-authenticate.

**Root cause:** `deploy.sh` was generating a new random `SECRET_KEY` on every run. Since JWTs are signed with this key, changing it invalidates all existing tokens.

**Fix:** `deploy.sh` now reads `SECRET_KEY` from `.env.deploy` if present. Only generates a new key if none is set, and prints a tip to save it. Add `SECRET_KEY=<value>` to `.env.deploy` to keep it stable across deployments.

---

### 6. N+1 query performance — slow list pages

**Symptom:** Loading the trial list or plot list is slow (seconds) even for small datasets.

**Root cause:** The original code ran 2 extra DB queries per trial (total/scored count) and 1 extra query per plot (has_observations check), causing N+1 query patterns.

**Fix:**
- `crud.get_trial_plot_counts_bulk()`: 2 GROUP BY queries for all trials at once instead of 2 per trial.
- `crud.get_plots_observed_set()`: 1 query returning all observed plot IDs instead of 1 per plot.
- Added DB indexes on `plots.trial_id`, `observations.plot_id`, and a composite index on `(plot_id, scoring_round_id)`.

---

### 7. Plots loading >1 minute on production

**Symptom:** Opening a trial's plot list blocks for 30–60+ seconds before any plots appear, especially on slow connections or through Cloudflare tunnel.

**Root cause:** `offlineApi.getPlots()` always waited for the full API response before returning. Unlike `getTrials()` (which used stale-while-revalidate — return cached data instantly, refresh in background), `getPlots()` blocked on every network request. With 240 plots per trial, the JSON payload is large and the wait is noticeable.

**Fix:** Applied the same stale-while-revalidate pattern to `getPlots()` in `frontend/src/db/offlineApi.ts`:
- Added `_fetchAndCachePlots()` helper (mirrors `_fetchAndCacheTrials()`)
- If IndexedDB has cached plots for the trial, return them instantly and refresh from API in background
- Added `_filterPlotsLocally()` for client-side search/scored filtering on cached data
- First-ever load (no cache) still waits for the API

---

### 8. "Offline — no cached plots" when clicking Resume trial

**Symptom:** Clicking the "Continue collecting" (Resume) card on the trial list shows an error: "Offline — no cached plots" or "Failed to load", even when online.

**Root cause:** The Resume card navigates to `/trials/{id}/collect` → `CollectRedirect.tsx`, which calls `prefetchTrialForOffline()` then `getPlots()`. The prefetch used `Promise.all()` with 4 parallel API calls — if ANY single call failed or timed out, the entire prefetch rejected and nothing was cached. Then `getPlots()` had no cache to fall back to.

**Fix:**
- Replaced `Promise.all()` with `Promise.allSettled()` in `prefetchTrialForOffline()` so partial successes get cached
- Combined with Issue 7's fix (getPlots returns cache first), Resume works even if the prefetch partially fails

---

### 9. All users see all trials (no per-user filtering)

**Symptom:** Every user sees every trial in the database, including trials created by other users.

**Root cause:** `backend/auth.py` uses `OAuth2PasswordBearer(auto_error=False)` so `get_current_user()` returns `None` for unauthenticated requests instead of raising 401. In `crud.get_trials()`, when both `user_id=None` and `team_id=None`, no filter was applied — the query returned ALL trials in the database.

**Fix:** Added `else: return []` in `crud.get_trials()` (backend/crud.py) so when neither user_id nor team_id is provided, an empty list is returned instead of all trials. One-line change.

---

### 10. Deleting trials leaves stale plot counts (e.g. 720 plots for 3 trials)

**Symptom:** After deleting a trial, the stat cards still show the deleted trial's plots in the total count. For example, 3 trials × 240 plots = 720 plots even though one trial was deleted.

**Root cause:** `TrialList.handleDelete()` called `api.deleteTrial(id)` (backend cascade works correctly) and removed the trial from React state, but never purged the IndexedDB cache. There was no `deleteTrial()` function in offlineApi.ts. Cached plots, scoring rounds, and trial traits from deleted trials persisted in IndexedDB. When `getTrials()` returned cached data (stale-while-revalidate), deleted trials reappeared with their plot counts.

**Fix:**
- Added `deleteTrial(trialId)` to `offlineApi.ts` that cascade-deletes: observations → plots → scoringRounds → trialTraits → trial from IndexedDB
- Updated `handleDelete()` in `TrialList.tsx` to call `offlineApi.deleteTrial()` after the API deletion succeeds

---

### 11. ObservationEntry page loads slowly (multiple seconds)

**Symptom:** Navigating to a plot's observation entry page shows "Loading..." for several seconds before data appears, even on a fast connection.

**Root cause:** `offlineApi.getTrial()` always waited for the API response before returning, unlike other functions (`getPlots`, `getTrials`) that used stale-while-revalidate. Since `getTrial()` runs first in `loadData()` and blocks the subsequent `Promise.all([getPlots, getTrialTraits, getScoringRounds])`, the entire page load was gated on a network round-trip.

**Fix:** Converted `getTrial()` in `frontend/src/db/offlineApi.ts` to the same stale-while-revalidate pattern: return from IndexedDB cache instantly, refresh from API in background. Added `_fetchAndCacheTrial()` helper.

---

### 12. AI severity classification not working after photo upload

**Symptom:** Uploading a photo on the ObservationEntry page completes successfully, but no AI severity prediction appears — no spinner, no result, no error.

**Root cause:** Two issues:

1. **Missing API key in production:** `GEMINI_API_KEY` was set in `.env.deploy` but was never passed to Cloud Run as an environment variable. The backend had `AI_CLASSIFICATION_ENABLED=true` but no key, so Gemini returned `None`, Groq also returned `None` (no key either), and the endpoint returned 503.

2. **Silent error swallowing:** The frontend's `handleImageUploaded` had a bare `catch {}` that silently discarded all errors, so the 503 was never surfaced to the user.

**Fix:**
- **Deploy:** Added `GEMINI_API_KEY` to Cloud Run env vars via `gcloud run deploy --set-env-vars` and redeployed the backend.
- **Frontend (`ObservationEntry.tsx`):** Replaced bare `catch {}` with error handling that shows the failure message to the user (except for known "AI disabled" 503 responses).
- **Backend (`ai_classifier.py`):** Added null-response guard for Gemini safety-blocked responses, and diagnostic logging showing key status and prediction results.
- **Local dev:** Created `backend/.env` with the Gemini API key (was missing; only `.env.deploy` had it).

**How to diagnose in future:**
```bash
# Check Cloud Run env vars for API keys
gcloud run services describe fieldscout-api --platform managed --region us-east1 \
  --format="yaml(spec.template.spec.containers[0].env)"

# Check Cloud Run logs for AI classifier output
gcloud run services logs read fieldscout-api --region=us-east1 --limit=20 | grep -i "predict\|gemini\|groq\|severity"
```

---

### 13. Offline prefetch takes over a minute (240+ API calls)

**Symptom:** Entering data collection mode or visiting the trial dashboard triggers hundreds of slow API calls visible in DevTools: `[SLOW API] GET /plots/{id}/observations?round_id=2 — 795ms` repeated for every plot.

**Root cause:** `prefetchTrialForOffline()` in `offlineApi.ts` fetched observations for each plot individually using `Promise.all(plots.map(p => api.getObservations(p.id, roundId)))`. With ~240 plots, this fired 240 parallel HTTP requests, overwhelming both the browser connection pool and the backend.

**Fix:**
- **Backend:** Added `GET /trials/{trial_id}/observations?round_id=` endpoint (`crud.get_trial_observations()`) that fetches all observations for a trial in a single SQL query joining through the plots table.
- **Frontend:** Updated `prefetchTrialForOffline()` to call `api.getTrialObservations(trialId, roundId)` — one request instead of 240.
- **API client:** Added `getTrialObservations()` method to `frontend/src/api/client.ts`.

---

## General Debugging Tips

| Problem | Where to look |
|---|---|
| 500 errors on Cloud Run | `gcloud run services logs read fieldscout-api --region=us-east1 --limit=50` |
| DB schema issues | `GET /health/db` or connect to Neon directly via SQLAlchemy |
| Migration stuck | Check `SELECT * FROM alembic_version` in Neon; manually stamp with `UPDATE alembic_version SET version_num = '<rev>'` |
| Slow API calls | Enable `DEBUG_QUERIES=1` env var on backend; check browser console for `[SLOW API]` warnings |
| Frontend not reflecting latest code on Vercel | Trigger a manual redeploy in Vercel dashboard or push a commit to `main` |
