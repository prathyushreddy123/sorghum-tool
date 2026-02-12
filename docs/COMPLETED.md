# Completed Work

This file tracks what has been built and tested. Use this to recover context after `/clear`.

---

## Backend - Task 1: Models + DB Setup

**Status:** COMPLETE (2026-02-07)

- [x] Data models finalized (Trial, Plot, Observation)
- [x] Pydantic schemas for all entities (create/response/stats)
- [x] SQLite database auto-creates tables on startup
- [x] FastAPI app with CORS, Swagger at /docs
- [x] Endpoints implemented (Task 2)
- [x] Stats + Export (Task 3)

### Files Created
- `backend/main.py` — FastAPI app, CORS, table creation
- `backend/database.py` — SQLite engine, SessionLocal, Base, get_db
- `backend/models.py` — Trial, Plot, Observation (SQLAlchemy mapped_column)
- `backend/schemas.py` — All Pydantic schemas (TrialCreate/Response, PlotCreate/Response, ObservationCreate/Response/BulkItem, stats, etc.)
- `backend/crud.py` — All database operations (CRUD, CSV import, validation, next-unscored)
- `backend/routers/trials.py` — GET/POST /trials, GET/DELETE /trials/{id}
- `backend/routers/plots.py` — GET/POST /trials/{id}/plots, POST import, GET next-unscored
- `backend/routers/observations.py` — GET/POST/PUT observations, POST bulk
- `backend/routers/stats.py` — GET stats + GET export (CSV download)

### Endpoints (12 total)
```
GET     /                                              root
GET     /trials                                        list trials (with plot_count, scored_count)
POST    /trials                                        create trial
GET     /trials/{trial_id}                             get trial
DELETE  /trials/{trial_id}                             delete trial + cascade
GET     /trials/{trial_id}/plots                       list plots (?search, ?scored)
POST    /trials/{trial_id}/plots                       create single plot
POST    /trials/{trial_id}/plots/import                CSV file upload
GET     /trials/{trial_id}/plots/{plot_id}/next-unscored  next unscored plot
GET     /plots/{plot_id}/observations                  list observations
POST    /observations                                  create observation (with validation)
PUT     /observations/{observation_id}                 update observation
POST    /plots/{plot_id}/observations/bulk             bulk create/update observations
GET     /trials/{trial_id}/stats                       per-trait stats (mean/SD/min/max/count)
GET     /trials/{trial_id}/export                      CSV download (pivoted, one row per plot)
```

### Models
- **Trial**: id, name, crop, location, start_date, end_date, created_at → has many Plots
- **Plot**: id, trial_id(FK), plot_id, genotype, rep, row, column, notes → has many Observations
- **Observation**: id, plot_id(FK), trait_name, value, recorded_at, notes

### Deviations from Spec
- None — matches BACKEND_SPEC.md exactly

### Key Behaviors
- Bulk endpoint (`POST /plots/{id}/observations/bulk`) upserts: overwrites existing observation for same trait
- Next-unscored wraps around to beginning if no unscored plots after current
- Validation: ergot 1-5, height 50-400, date YYYY-MM-DD format
- Plots ordered by row then column
- Trial delete cascades to plots and observations
- Stats: population SD (not sample), handles empty data with nulls
- Export CSV: filename = `{trial_name}_{start_date}.csv`, unscored plots get empty trait columns
- **Backend is fully complete (14 endpoints). Ready for frontend.**

### How to Run
```bash
cd backend
venv/bin/uvicorn main:app --reload --port 8000
```
Venv at `backend/venv/`. Must use venv binaries (system Python is PEP 668 locked).

---

## Frontend - Task 4: Shell + Trial Management

**Status:** COMPLETE (2026-02-07)

- [x] Vite + React 18 + TypeScript + Tailwind CSS v4 scaffolded
- [x] Color palette configured via @theme in index.css
- [x] React Router v6 with all routes
- [x] API client module (all endpoints typed)
- [x] Layout + Header (sticky, back button)
- [x] TrialList page (home) — lists trials with plot counts
- [x] CreateTrial form — name, location, start/end dates
- [x] TrialDashboard — progress bar, stat cards, action buttons, CSV export
- [x] CollectRedirect — finds first unscored plot
- [x] PlotList + ObservationEntry — placeholder stubs (Task 5 & 6)
- [x] TypeScript type-checks clean, build succeeds

### Routes
```
/                              TrialList (home)
/trials/new                    CreateTrial form
/trials/:trialId               TrialDashboard (progress + stats + actions)
/trials/:trialId/plots         PlotList (stub)
/trials/:trialId/collect       CollectRedirect → first unscored plot
/trials/:trialId/collect/:plotId  ObservationEntry (stub)
```

### Frontend Files
- `src/App.tsx` — BrowserRouter + all routes
- `src/api/client.ts` — typed API client (all 14 endpoints)
- `src/types/index.ts` — Trial, Plot, Observation, Stats types
- `src/components/Layout.tsx` — main layout with Outlet
- `src/components/Header.tsx` — sticky green header with back nav
- `src/pages/TrialList.tsx` — trial cards, empty state, + New Trial button
- `src/pages/CreateTrial.tsx` — form with validation
- `src/pages/TrialDashboard.tsx` — progress bar, stat cards, export button
- `src/pages/CollectRedirect.tsx` — redirects to first unscored plot
- `src/pages/PlotList.tsx` — search, filter tabs, CSV import, scored badges
- `src/pages/ObservationEntry.tsx` — full observation form with save & next
- `src/components/SeveritySelector.tsx` — 5 large buttons (1-5) with labels
- `src/components/ReferenceModal.tsx` — full-screen modal with severity reference

### Tailwind v4 Setup
- Uses `@tailwindcss/vite` plugin (not PostCSS)
- Colors defined via `@theme {}` in `src/index.css`
- Custom colors: primary, primary-light, warning, error, neutral, background, card

### How to Run
```bash
cd frontend && npm run dev    # http://localhost:5173
cd backend && venv/bin/uvicorn main:app --reload --port 8000
```

---

## Frontend - Task 5: Plot Management

**Status:** COMPLETE (2026-02-07)
- [x] Plot list with search by plot_id/genotype
- [x] Filter tabs: All / Unscored / Scored
- [x] CSV import button with file upload + result feedback
- [x] Scored/Unscored badges on plot cards
- [x] Click plot → navigates to observation entry
- [x] Empty states for no plots / no results
- [x] TypeScript clean, build succeeds

---

## Frontend - Task 6: Observation Entry

**Status:** COMPLETE (2026-02-07)
- [x] Severity buttons (1-5) — large 60px min-height, selected state, labels + percentages
- [x] Reference images modal — full-screen, 5 color-coded severity levels with descriptions
- [x] Flowering date picker (native date input)
- [x] Plant height input (50-400 validation, inline error)
- [x] Notes textarea
- [x] Save & Next — bulk save + auto-advance to next unscored plot
- [x] Save (Stay Here) — saves without advancing
- [x] Edit existing observations — values pre-filled on load
- [x] Prev/Next navigation buttons with index counter
- [x] Toast feedback on save
- [x] "All plots scored" message when no more unscored
- [x] TypeScript clean, build succeeds

---

## Frontend - Task 7: Stats + Export + Polish

**Status:** COMPLETE (2026-02-07)

### Mobile Responsiveness Fixes
- [x] TrialList: fixed conflicting `block`+`flex` on New Trial button
- [x] PlotList: added `truncate` + `min-w-0` for long genotype names, `flex-shrink-0` on badges
- [x] Dashboard: stats refresh on window focus (navigating back from scoring)
- [x] Dashboard: conditional UI — hides "Record" when 0 plots, hides "Export" when 0 scored
- [x] Dashboard: empty state when 0 plots prompts CSV import
- [x] TrialList: backend-down error message with port hint

### Demo Seed Script
- [x] `backend/seed_demo.py` — 1 trial, 20 plots (10 genotypes x 2 reps), 12 scored
- [x] Realistic genotype names (IS8525, ATx623, SC748-5, etc.)
- [x] Varied severity (1-4), heights (101-239cm), flowering dates (Jun 8-20)
- [x] 3 plots have notes

### Final End-to-End Verified
- [x] Trial list shows 1 trial with 20 plots, 12 scored
- [x] Dashboard shows progress (60%), stat cards, all action buttons
- [x] Stats: ergot mean=2.5, height mean=148.8, flowering count=12
- [x] CSV export: 20 rows, correct pivoted columns
- [x] Next-unscored: correctly returns plot 13 (first unscored after plot 12)
- [x] TypeScript clean, build succeeds

---

## Post-MVP Features — Session 2 (2026-02-08)

### Feature 8: Delete Trial/Plot UI

**Status:** COMPLETE (2026-02-08)

- [x] Backend: `delete_plot()` in crud.py + `DELETE /trials/{trial_id}/plots/{plot_id}` endpoint
- [x] Frontend: reusable `ConfirmDialog` component (red confirm button, loading state)
- [x] TrialList: trash icon on each trial card, confirmation dialog, removes from list on success
- [x] TrialDashboard: "Delete Trial" button at bottom, navigates to `/` on success
- [x] PlotList: trash icon on each plot card, refetches list on success
- [x] Plot card restructured from `<button>` to `<div>` wrapper (nested interactive fix)
- [x] Cascade deletes verified (trial → plots → observations)

**Files created:** `frontend/src/components/ConfirmDialog.tsx`
**Files modified:** `backend/crud.py`, `backend/routers/plots.py`, `frontend/src/api/client.ts`, `frontend/src/pages/TrialList.tsx`, `frontend/src/pages/TrialDashboard.tsx`, `frontend/src/pages/PlotList.tsx`

---

### Feature 9: Plot Count on Filter Tabs + Search Debounce

**Status:** COMPLETE (2026-02-08)

- [x] Filter tabs show counts: "All (20)", "Scored (12)", "Unscored (8)"
- [x] Counts derived from `api.getStats()` (total_plots, scored_plots)
- [x] Counts refresh after plot delete or CSV import
- [x] 300ms search debounce via `debouncedSearch` state + `useEffect` with `setTimeout`

**Files modified:** `frontend/src/pages/PlotList.tsx`

---

### Feature 10: Severity Histogram on Dashboard

**Status:** COMPLETE (2026-02-08)

- [x] Backend: `ergot_distribution` field added to `TrialStatsResponse` (scores 1-5 with counts)
- [x] Backend: distribution computed via `Counter` in `get_trial_stats()`
- [x] Frontend: `recharts` installed (BarChart, ResponsiveContainer)
- [x] `SeverityHistogram` component with color-coded bars (green→red)
- [x] Histogram renders on dashboard below stat cards when ergot data exists
- [x] Schema: `SeverityDistributionItem(score, count)`

**Files created:** `frontend/src/components/SeverityHistogram.tsx`
**Files modified:** `backend/crud.py`, `backend/schemas.py`, `frontend/src/types/index.ts`, `frontend/src/pages/TrialDashboard.tsx`, `frontend/package.json`

**Colors:** 1=#4CAF50, 2=#8BC34A, 3=#FFC107, 4=#FF9800, 5=#D32F2F

---

### Feature 11: Heatmap View

**Status:** COMPLETE (2026-02-08)

- [x] Backend: `HeatmapCell`, `HeatmapResponse` schemas
- [x] Backend: `get_trial_heatmap()` in crud.py — joins plots + ergot observations
- [x] Backend: `GET /trials/{trial_id}/heatmap` endpoint in stats router
- [x] Frontend: `HeatmapGrid` component — CSS grid with color-coded cells, row/col labels, legend
- [x] Frontend: `HeatmapView` page at `/trials/:trialId/heatmap`
- [x] Clicking a cell navigates to that plot's observation entry
- [x] `overflow-x-auto` for horizontal scroll on mobile
- [x] "Severity Heatmap" button on dashboard (shown when scored_plots > 0)

**Files created:** `frontend/src/components/HeatmapGrid.tsx`, `frontend/src/pages/HeatmapView.tsx`
**Files modified:** `backend/crud.py`, `backend/schemas.py`, `backend/routers/stats.py`, `frontend/src/types/index.ts`, `frontend/src/api/client.ts`, `frontend/src/App.tsx`, `frontend/src/pages/TrialDashboard.tsx`

---

### Feature 12: Real Ergot Reference Images

**Status:** COMPLETE (2026-02-08)

- [x] 5 SVG illustrations in `frontend/public/images/ergot/severity-{1-5}.svg`
- [x] Each shows a sorghum panicle with increasing honeydew/infection
- [x] `ReferenceModal` updated to show `<img>` tags with `onError` fallback to colored boxes
- [x] Images sized 80x80px, lazy loaded

**Files created:** `frontend/public/images/ergot/severity-{1-5}.svg`
**Files modified:** `frontend/src/components/ReferenceModal.tsx`

---

### Test Suite

**Status:** COMPLETE (2026-02-08)

- [x] `backend/test_features.py` — 30 pytest tests covering all 5 features
- [x] Uses isolated test database (`test_sorghum.db`) with per-test setup/teardown
- [x] Tests: delete trial (3), delete plot (5), plot counts (4), histogram (5), heatmap (9), reference validation (3), full E2E workflow (1)
- [x] All 30/30 passing

```bash
cd backend && venv/bin/pytest test_features.py -v
```

---

## Summary

MVP (Tasks 1-7) + Post-MVP (Features 8-12) all complete.

- **Backend:** 17 endpoints, 30 automated tests
- **Frontend:** 7 routes, 14 components
- **New dependencies:** recharts, httpx, pytest

---

## Commands Cheat Sheet

```bash
# Start backend (with demo data)
cd backend && rm -f sorghum.db && venv/bin/python seed_demo.py && venv/bin/uvicorn main:app --reload --port 8000

# Start frontend
cd frontend && npm run dev    # http://localhost:5173

# Start backend (empty DB)
cd backend && rm -f sorghum.db && venv/bin/uvicorn main:app --reload --port 8000

# View API docs
open http://localhost:8000/docs

# Test mobile view
# Chrome DevTools → Device toggle → iPhone SE (375x667)
```
