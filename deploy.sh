#!/bin/bash
# FieldScout Production Deployment Script
# Prerequisites:
#   1. gcloud CLI authenticated: gcloud auth login
#   2. GCP project set: gcloud config set project PROJECT_ID
#   3. Neon.tech database connection string ready
#
# Usage: ./deploy.sh

set -e
GCLOUD="/home/prat/google-cloud-sdk/bin/gcloud"
DIR="$(cd "$(dirname "$0")" && pwd)"
REGION="us-east1"
SERVICE_NAME="fieldscout-api"

# Load deployment environment variables if .env.deploy exists
if [ -f "$DIR/.env.deploy" ]; then
  export $(grep -v '^#' "$DIR/.env.deploy" | xargs)
fi

echo "============================================"
echo "  FieldScout Production Deployment"
echo "============================================"
echo ""

# Check gcloud auth
if ! $GCLOUD auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
  echo "ERROR: Not authenticated. Run:"
  echo "  $GCLOUD auth login"
  exit 1
fi

PROJECT_ID=$($GCLOUD config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  echo "ERROR: No GCP project set. Run:"
  echo "  $GCLOUD config set project YOUR_PROJECT_ID"
  exit 1
fi

echo "GCP Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# Prompt for Neon database URL
if [ -z "$DATABASE_URL" ]; then
  read -p "Neon.tech DATABASE_URL (postgresql://...): " DATABASE_URL
fi

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is required"
  exit 1
fi

# Use SECRET_KEY from .env.deploy if set, otherwise generate one
# WARNING: generating a new key on every deploy logs out all users.
# Set SECRET_KEY in .env.deploy to keep it stable across deployments.
if [ -z "$SECRET_KEY" ]; then
  SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  echo "Generated new SECRET_KEY: ${SECRET_KEY:0:8}..."
  echo "  TIP: Add SECRET_KEY=$SECRET_KEY to .env.deploy to reuse it next time"
else
  echo "Using SECRET_KEY from .env.deploy: ${SECRET_KEY:0:8}..."
fi

# Get API keys from current .env if available
GEMINI_KEY=""
GROQ_KEY=""
if [ -f "$DIR/backend/.env" ]; then
  GEMINI_KEY=$(grep -oP 'GEMINI_API_KEY=\K.*' "$DIR/backend/.env" 2>/dev/null || true)
  GROQ_KEY=$(grep -oP 'GROQ_API_KEY=\K.*' "$DIR/backend/.env" 2>/dev/null || true)
fi

echo ""
echo "Step 1/3: Enabling Cloud Run API..."
$GCLOUD services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com 2>/dev/null || true

echo ""
echo "Step 2/3: Building Docker image..."
$GCLOUD builds submit "$DIR/backend" \
  --tag "gcr.io/$PROJECT_ID/$SERVICE_NAME" \
  --timeout=600

echo ""
echo "Step 3/3: Deploying to Cloud Run..."

ENV_VARS="DATABASE_URL=postgresql://neondb_owner:npg_FrOo6gx1TsIA@ep-morning-cherry-ainul04b-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"
ENV_VARS="$ENV_VARS,SECRET_KEY=$SECRET_KEY"
ENV_VARS="$ENV_VARS,CORS_ORIGINS=*"
ENV_VARS="$ENV_VARS,AI_CLASSIFICATION_ENABLED=true"

if [ -n "$GEMINI_KEY" ]; then
  ENV_VARS="$ENV_VARS,GEMINI_API_KEY=$GEMINI_KEY"
fi
if [ -n "$GROQ_KEY" ]; then
  ENV_VARS="$ENV_VARS,GROQ_API_KEY=$GROQ_KEY"
fi

$GCLOUD run deploy "$SERVICE_NAME" \
  --image "gcr.io/$PROJECT_ID/$SERVICE_NAME" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 512Mi \
  --min-instances 0 \
  --max-instances 2 \
  --port 8000 \
  --set-env-vars "$ENV_VARS"

BACKEND_URL=$($GCLOUD run services describe "$SERVICE_NAME" --platform managed --region "$REGION" --format="value(status.url)")

echo ""
echo "============================================"
echo "  Backend deployed!"
echo ""
echo "  API URL: $BACKEND_URL"
echo "  Docs:    $BACKEND_URL/docs"
echo ""
echo "  Next: Deploy frontend to Vercel"
echo "  1. Go to https://vercel.com/new"
echo "  2. Import: prathyushreddy123/sorghum-tool"
echo "  3. Root Directory: frontend"
echo "  4. Add Environment Variable:"
echo "     VITE_API_BASE = $BACKEND_URL"
echo "  5. Deploy!"
echo ""
echo "  After Vercel deploys, update CORS:"
echo "  $GCLOUD run services update $SERVICE_NAME \\"
echo "    --region $REGION \\"
echo "    --update-env-vars CORS_ORIGINS=https://YOUR_VERCEL_DOMAIN.vercel.app,http://localhost:5173"
echo "============================================"
