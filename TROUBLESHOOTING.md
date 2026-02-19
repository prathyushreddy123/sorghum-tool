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

## General Debugging Tips

| Problem | Where to look |
|---|---|
| 500 errors on Cloud Run | `gcloud run services logs read fieldscout-api --region=us-east1 --limit=50` |
| DB schema issues | `GET /health/db` or connect to Neon directly via SQLAlchemy |
| Migration stuck | Check `SELECT * FROM alembic_version` in Neon; manually stamp with `UPDATE alembic_version SET version_num = '<rev>'` |
| Slow API calls | Enable `DEBUG_QUERIES=1` env var on backend; check browser console for `[SLOW API]` warnings |
| Frontend not reflecting latest code on Vercel | Trigger a manual redeploy in Vercel dashboard or push a commit to `main` |
