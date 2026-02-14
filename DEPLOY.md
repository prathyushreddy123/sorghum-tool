# SorghumField Deployment Guide

## Architecture

```
Vercel (Frontend)  →  Cloud Run (Backend API)  →  Neon PostgreSQL
                                               →  GCS (images)
```

## Prerequisites

- Google Cloud account with billing enabled (free tier / credits)
- Vercel account (free tier)
- Neon.tech account (free tier)

## 1. Database (Neon.tech PostgreSQL)

1. Create a project at [neon.tech](https://neon.tech)
2. Copy the connection string: `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/sorghum?sslmode=require`
3. Save as `DATABASE_URL`

## 2. Google Cloud Storage (optional)

```bash
# Create bucket
gsutil mb -l us-east1 gs://sorghumfield-images

# Set CORS for browser access
cat > /tmp/cors.json << 'EOF'
[{"origin": ["*"], "method": ["GET"], "maxAgeSeconds": 3600}]
EOF
gsutil cors set /tmp/cors.json gs://sorghumfield-images
```

Set `GCS_BUCKET=sorghumfield-images` in environment.

## 3. Backend (Cloud Run)

```bash
cd backend

# Build and push container
gcloud builds submit --tag gcr.io/PROJECT_ID/sorghumfield-api

# Deploy
gcloud run deploy sorghumfield-api \
  --image gcr.io/PROJECT_ID/sorghumfield-api \
  --platform managed \
  --region us-east1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "DATABASE_URL=postgresql://...,SECRET_KEY=...,CORS_ORIGINS=https://your-app.vercel.app,GCS_BUCKET=sorghumfield-images,GEMINI_API_KEY=...,GROQ_API_KEY=..."
```

The backend URL will be printed (e.g., `https://sorghumfield-api-xxx.run.app`).

## 4. Frontend (Vercel)

1. Connect your GitHub repo to Vercel
2. Set root directory to `frontend/`
3. Set environment variable: `VITE_API_BASE=https://sorghumfield-api-xxx.run.app`
4. Deploy

## 5. Migrate Existing Data (optional)

```bash
cd backend
export TARGET_DATABASE_URL="postgresql://..."
python scripts/migrate_sqlite_to_pg.py
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SECRET_KEY` | Yes (prod) | JWT signing key (random 64+ chars) |
| `CORS_ORIGINS` | Yes (prod) | Comma-separated allowed origins |
| `GCS_BUCKET` | No | GCS bucket name (omit for local storage) |
| `GEMINI_API_KEY` | No | For AI severity classification |
| `GROQ_API_KEY` | No | Fallback AI provider |
| `AI_CLASSIFICATION_ENABLED` | No | Default: true |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Default: 1440 (24h) |

## Local Development

```bash
./start.sh    # starts backend, frontend, and Cloudflare tunnels
./stop.sh     # stops everything
```
