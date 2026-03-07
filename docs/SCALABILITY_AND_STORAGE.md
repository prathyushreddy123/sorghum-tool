# FieldScout — Scalability & Storage Guide

Capacity analysis and storage recommendations for the current production stack
(Vercel + Railway + Supabase + RunPod).

Last updated: 2026-03-06

---

## 1. Current Infrastructure

| Layer | Config | Limits |
|-------|--------|--------|
| **Frontend** | Vercel (static + edge) | Effectively unlimited for static assets |
| **Backend** | Railway, 1x uvicorn worker (single process) | ~50 concurrent requests before queueing |
| **DB pool** | PostgreSQL: `pool_size=5`, `max_overflow=10` | 15 simultaneous DB connections |
| **Supabase DB** | Free: 500MB, Pro: 8GB storage | Row count varies by data density |
| **Supabase Storage** | Free: 1GB, Pro: 100GB (3 buckets: `images`, `training-images`, `models`) | Image count depends on avg size |
| **Image upload** | 5MB max per file; client compresses to 1200px JPEG 0.85 (~200-400KB) | — |
| **IndexedDB (client)** | Browser-dependent; typically 50MB-2GB | Varies by device/browser |
| **RunPod** | Serverless GPU for model training | On-demand, no persistent limit |

---

## 2. Capacity by Entity

### Users

| Tier | Count | Status |
|------|-------|--------|
| Small lab | 1-10 | Works perfectly |
| Multi-team | 20-50 | Works fine; watch connection pool |
| Department | 50-200 | Single uvicorn process saturates under concurrent load |
| Institution | 200+ | Requires multiple workers + connection pooler |

**What limits it:** Single uvicorn process handles all requests serially (no parallelism).
Each authenticated request runs `require_user` (1 DB query). Under 50+ concurrent
users, requests queue behind each other.

**Fix at scale:** `uvicorn main:app --workers 4` or use gunicorn with uvicorn workers.
Add PgBouncer or Supavisor for connection pooling beyond 15 simultaneous connections.

### Crops

**No limit.** Crops are a string field on Trial (`Trial.crop`). Adding new crops requires
no schema changes. AI models are keyed by `{crop}/{trait_name}` in the manifest.

### Trials

| Count | Performance | Notes |
|-------|-------------|-------|
| 1-500 | <100ms | Fast |
| 500-2,000 | 100-300ms | `GET /trials` returns all trials (no pagination) |
| 2,000-10,000 | 300ms-1s+ | Response payloads grow large; needs cursor pagination |
| 10,000+ | Degraded | Must add pagination and indexed queries |

**What limits it:** `GET /trials` returns the full list with no pagination. The
`get_trial_plot_counts_bulk` helper does 2 GROUP BY queries which scale linearly
with trial count.

### Plots

| Per-trial | Total across DB | Performance |
|-----------|----------------|-------------|
| 1-500 | 1-50K | Fast everywhere |
| 500-1,000 | 50-100K | Heatmap and stats start slowing (300-500ms) |
| 1,000-2,000 | 100-200K | Heatmap >1s; prefetch payloads >1MB |
| 2,000+ | 200K+ | Needs pagination on plot list; heatmap needs server-side rendering |

**Heaviest endpoints per-trial:**
- **Heatmap** (`get_trial_heatmap`): Loads ALL plots + observations for the trial into memory.
  At 1,000 plots with 5 traits, this scans ~5,000 observation rows per request.
- **Stats** (`get_trial_stats`): Runs 2-3 SQL queries **per trait** (count, aggregates,
  distribution). A trial with 10 traits = 25+ queries per dashboard load.
- **Offline prefetch** (`prefetchTrialForOffline`): Downloads all observations for the
  latest round in one request. At 1,000 plots x 5 traits = 5,000 rows (~500KB JSON).

### Observations

| Total rows | Performance | Notes |
|------------|-------------|-------|
| 1-50K | Fast | All queries use indexed paths |
| 50-200K | Good | Compound index `(plot_id, scoring_round_id)` handles hot path |
| 200K-1M | Slowing | Stats queries do JOIN through plots; no index on `(plot_id, trait_id)` |
| 1M+ | Needs optimization | Add composite indexes; consider materialized views for stats |

**Missing index:** No index on `(plot_id, trait_id)`, which the stats and heatmap
queries filter on. Adding this would improve stats from O(n) scan to indexed lookup.

**CSV export:** Loads all observations for a trial into memory. At 50,000+
observations, this causes memory spikes on the Railway container (512MB default).

### Images

| Avg size | 1GB (free) | 100GB (Pro) |
|----------|-----------|-------------|
| 200KB (compressed) | ~5,000 images | ~500,000 images |
| 400KB (compressed) | ~2,500 images | ~250,000 images |
| 1MB (original, no compression) | ~1,000 images | ~100,000 images |

**Storage path structure (new):** `user_{id}/{trial_id}/{plot_id}/{uuid}.ext`

**ZIP download bottleneck:** `GET /trials/{trial_id}/download-images` fetches each image
from Supabase via `storage.get_bytes()`, builds the ZIP in memory, then streams it.
A trial with 500 images x 300KB = 150MB held in RAM. Railway free tier (512MB) will
OOM at ~1,500 images in a single download.

**Image serving:** Redirect-to-Supabase-public-URL pattern is efficient. Supabase CDN
handles the actual byte serving. No server memory pressure.

---

## 3. Typical UGA Deployment Scale

A standard sorghum trial at UGA has ~240 plots, 3-5 traits, 2-3 scoring rounds:

| Metric | Per trial | Per season (10-20 trials) |
|--------|-----------|--------------------------|
| Plots | 240 | 2,400-4,800 |
| Observations | ~3,600 (240 x 5 x 3) | 36,000-72,000 |
| Images | ~240-480 (1-2 per plot) | 2,400-9,600 |
| Storage | ~72-144MB | 720MB-2.9GB |
| Users | 5-15 | 5-15 |

**Verdict:** The current setup handles this comfortably on Supabase Pro. All endpoints
respond in <200ms. IndexedDB prefetch is ~200KB per trial. ZIP downloads fit in memory.

---

## 4. Where It Breaks — Quick Reference

| Scale | What breaks first | Symptom |
|-------|------------------|---------|
| 50+ concurrent users | Single uvicorn worker | Requests queue, 5-10s response times |
| 2,000+ trials | No pagination on `GET /trials` | Slow list loads, large payloads |
| 1,000+ plots/trial | Heatmap + stats | Dashboard takes >1s, mobile browsers struggle |
| 200K+ observations | Stats N+1 queries | Dashboard takes 3-5s |
| 1,500+ images in one ZIP | ZIP download OOM | Railway process killed, 502 error |
| 100GB storage | Supabase Pro limit | Upgrade to Team plan or add GCS overflow |

---

## 5. Storage Recommendations for Growth

### 5a. Image Storage Optimization

**Server-side thumbnails.** Generate 200px thumbnails on upload (or via Supabase Edge
Functions) and store in a `thumbnails/` prefix. Serve thumbnails for grid/list views;
load full images only on tap. This cuts bandwidth 10-20x for browsing pages.

```
images/user_5/12/45/abc123.jpg          ← full (300KB)
images/user_5/12/45/abc123_thumb.jpg    ← thumbnail (15KB)
```

**Lifecycle policies.** Configure Supabase or GCS to automatically tier down images
older than 6 months to cheaper archive storage. Images past a trial's end date rarely
need fast random access.

**Content-addressable deduplication.** Store a `content_hash` (SHA-256 of compressed
bytes) on the Image model. Before saving, check if the hash already exists. Researchers
often photograph the same plot multiple times or re-upload the same file. This can
reduce storage by 10-30% in practice.

### 5b. Storage Path Strategy for Multi-Crop Scale

**Partition by crop and year** for efficient bulk operations:

```
images/{crop}/{year}/{trial_id}/{plot_id}/{uuid}.ext
```

Example:
```
images/sorghum/2026/trial_12/plot_45/abc123.jpg
images/maize/2026/trial_89/plot_12/def456.jpg
```

This lets training pipelines efficiently list all images for a specific crop
(`ls images/sorghum/`) without scanning the entire bucket. Supabase Storage
`list(prefix)` and GCS prefix queries both benefit from this structure.

### 5c. Database Schema for Flexible Metadata

As crops and traits multiply, add a `metadata JSONB` column on Image for
crop-specific fields without schema migrations:

```sql
ALTER TABLE images ADD COLUMN metadata JSONB DEFAULT '{}';

-- Example data:
-- {"growth_stage": "flowering", "weather": "sunny", "gps_cluster": "field_A"}
```

With a GIN index, queries like "all sorghum panicle images at flowering stage" become
fast:

```sql
CREATE INDEX ix_images_metadata ON images USING GIN (metadata);
SELECT * FROM images WHERE metadata @> '{"growth_stage": "flowering"}';
```

This is especially valuable for model retraining — you can filter training data by
growth stage, weather conditions, or field location without adding columns for each.

### 5d. CDN for Image Serving

Put Supabase Storage behind a CDN (Cloudflare or Vercel Edge) with aggressive caching
headers. UUID-based filenames are immutable (content never changes at a given URL), so
you can set `Cache-Control: public, max-age=31536000, immutable`.

This eliminates redundant Supabase bandwidth charges when the same image is viewed
multiple times (e.g., during scoring review or team collaboration).

### 5e. Batch Export for Model Retraining

The ZIP download endpoint works for small trials, but for large-scale retraining
(10K+ images), use an async approach:

1. Backend generates a **manifest JSON** with signed URLs for each image:
   ```json
   {
     "images": [
       {"url": "https://...signed...", "label": "3", "trait": "ergot_severity", "crop": "sorghum"},
       ...
     ]
   }
   ```

2. Training pipeline fetches images in parallel (10-50 concurrent downloads) directly
   from Supabase, bypassing the backend entirely.

3. Manifest can be filtered server-side by crop, trait, date range, growth stage
   (using the JSONB metadata).

This avoids the memory bottleneck of building a ZIP on the server and scales to
hundreds of thousands of images.

### 5f. IndexedDB Quota Management

Mobile browsers typically allow 50MB-2GB for IndexedDB. With offline image queuing,
a researcher photographing 500 plots at 300KB each = 150MB of pending images.

Current safeguards:
- Storage quota warning at >80% usage (StorageWarning component)
- `navigator.storage.estimate()` polled every 30s
- "Sync Now" button for manual upload when connectivity returns

Additional recommendations:
- Request persistent storage (`navigator.storage.persist()`) on first use to prevent
  the browser from evicting data under storage pressure.
- Implement FIFO eviction of cached (already-synced) images when quota exceeds 70%.
- Show per-trial storage breakdown in Settings so users can clear specific trials.

---

## 6. Scaling Roadmap (When Needed)

These changes are NOT needed for the current UGA deployment but document the path
forward if FieldScout grows beyond a single research group.

### Phase 1: Multi-team (50-200 users)

| Change | Effort | Impact |
|--------|--------|--------|
| `uvicorn --workers 4` in Procfile | 1 line | 4x concurrent capacity |
| Add pagination to `GET /trials` and `GET /plots` | 2-3 hours | Unbounded lists eliminated |
| Collapse stats into 1-2 queries (GROUP BY trait_id) | 2 hours | 5-10x faster dashboard |
| Add index on `observations(plot_id, trait_id)` | 1 migration | Faster stats + heatmap |
| Server-side thumbnails | 4 hours | 10x less bandwidth on list views |

### Phase 2: Breeding program (200-1,000 users)

| Change | Effort | Impact |
|--------|--------|--------|
| PgBouncer / Supavisor connection pooling | Config only | 100+ concurrent DB connections |
| Streaming ZIP (chunked writes, not in-memory) | 4 hours | No RAM limit on image downloads |
| Background job queue (Celery or equivalent) | 1 day | Export, ZIP, training don't block API |
| Read replicas for stats/heatmap queries | Supabase config | Stats don't compete with writes |
| Image CDN (Cloudflare) | Config only | Zero Supabase bandwidth for repeat views |

### Phase 3: Multi-site network (1,000+ users)

| Change | Effort | Impact |
|--------|--------|--------|
| Horizontal API scaling (multiple Railway services) | Half day | Linear scaling with traffic |
| Materialized views for trial stats | 4 hours | Stats in <10ms regardless of data size |
| Partitioned observations table (by trial_id range) | 1 day | Prevents single-table bloat at millions of rows |
| GCS or S3 for image overflow | 4 hours | Unlimited image storage beyond Supabase 100GB |
| Async training data manifests | 4 hours | Retraining pipeline scales to 100K+ images |

---

## 7. Monitoring Checklist

To stay ahead of bottlenecks, monitor these metrics:

| Metric | Where | Warning threshold |
|--------|-------|-------------------|
| API response time (p95) | Railway metrics | >500ms |
| DB connection pool usage | `SELECT count(*) FROM pg_stat_activity` | >10 of 15 |
| Supabase storage usage | Supabase dashboard | >70% of plan |
| Supabase DB size | Supabase dashboard | >5GB on Pro |
| Observation row count | `SELECT count(*) FROM observations` | >500K |
| Image count | `SELECT count(*) FROM images` | >50K |
| Slow queries | `DEBUG_QUERIES=1` env var; `[SLOW QUERY]` logs | Any >100ms |
| Frontend bundle size | `vite build` output | Main chunk >500KB |
| IndexedDB quota | Browser `navigator.storage.estimate()` | >80% |
