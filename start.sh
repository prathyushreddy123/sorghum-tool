#!/bin/bash
# Start FieldScout backend, frontend, and Cloudflare tunnels
# Usage: ./start.sh
# Logs: /tmp/sorghum-*.log

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="/tmp"

# Load backend env vars if .env exists
if [ -f "$DIR/backend/.env" ]; then
  set -a
  source "$DIR/backend/.env"
  set +a
fi

# Kill any existing instances
"$DIR/stop.sh" 2>/dev/null || true

echo "Starting FieldScout..."

# 1. Backend (FastAPI)
cd "$DIR/backend"
nohup "$HOME/.local/bin/uvicorn" main:app --reload --host 0.0.0.0 --port 8000 \
  > "$LOG_DIR/sorghum-backend.log" 2>&1 &
echo $! > "$LOG_DIR/sorghum-backend.pid"
echo "  Backend started on :8000 (PID $!)"

# 2. Wait for backend to be ready
for i in {1..10}; do
  curl -sf http://localhost:8000/trials > /dev/null 2>&1 && break
  sleep 1
done

# 3. Cloudflare tunnel for backend
nohup ~/.local/bin/cloudflared tunnel --url http://localhost:8000 \
  > "$LOG_DIR/sorghum-tunnel-backend.log" 2>&1 &
echo $! > "$LOG_DIR/sorghum-tunnel-backend.pid"

# 4. Wait for backend tunnel URL
sleep 5
BACKEND_URL=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/sorghum-tunnel-backend.log" | head -1)

if [ -z "$BACKEND_URL" ]; then
  echo "  WARNING: Could not get backend tunnel URL. Check $LOG_DIR/sorghum-tunnel-backend.log"
  BACKEND_URL="http://localhost:8000"
fi
echo "  Backend tunnel: $BACKEND_URL"

# 5. Frontend — production build + preview server
# vite build bundles all lazy chunks into single files so Cloudflare tunnel
# requests are fast (1 file per route instead of 10+ module files per route).
cd "$DIR/frontend"
echo "  Building frontend (this takes ~15s)..."
VITE_API_BASE="$BACKEND_URL" npx vite build >> "$LOG_DIR/sorghum-frontend.log" 2>&1
nohup npx vite preview --host --port 5173 \
  > "$LOG_DIR/sorghum-frontend.log" 2>&1 &
echo $! > "$LOG_DIR/sorghum-frontend.pid"
sleep 2
echo "  Frontend preview started on :5173 (PID $(cat "$LOG_DIR/sorghum-frontend.pid"))"

# 6. Cloudflare tunnel for frontend
nohup ~/.local/bin/cloudflared tunnel --url http://localhost:5173 \
  > "$LOG_DIR/sorghum-tunnel-frontend.log" 2>&1 &
echo $! > "$LOG_DIR/sorghum-tunnel-frontend.pid"

sleep 5
FRONTEND_URL=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/sorghum-tunnel-frontend.log" | head -1)

echo ""
echo "=========================================="
echo "  FieldScout is running!"
echo ""
echo "  Phone URL: $FRONTEND_URL"
echo "  Backend:   $BACKEND_URL"
echo "  Local:     http://localhost:5173"
echo ""
echo "  Stop with: ./stop.sh"
echo "=========================================="
