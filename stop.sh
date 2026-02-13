#!/bin/bash
# Stop all SorghumField services
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

echo "All SorghumField services stopped."
