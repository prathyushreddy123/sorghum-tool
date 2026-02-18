#!/bin/bash
# Stop all FieldScout services
LOG_DIR="/tmp"

for svc in backend frontend tunnel-backend tunnel-frontend; do
  PID_FILE="$LOG_DIR/sorghum-$svc.pid"
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    kill "$PID" 2>/dev/null && echo "Stopped $svc (PID $PID)" || true
    rm -f "$PID_FILE"
  fi
done

# Clean up any strays
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f cloudflared 2>/dev/null || true
pkill -f "vite --host" 2>/dev/null || true
pkill -f "vite preview" 2>/dev/null || true

# Wait until port 8000 is actually free before returning, so start.sh
# never hits "Address already in use" on a fast restart.
for i in {1..10}; do
  lsof -ti :8000 > /dev/null 2>&1 || break
  sleep 0.5
done

echo "All FieldScout services stopped."
