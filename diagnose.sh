#!/bin/bash
echo "=== SorghumField Diagnostics ==="
echo ""

echo "1. Backend Status:"
if pgrep -f "uvicorn main:app" > /dev/null; then
    echo "   ✓ Backend is running"
else
    echo "   ✗ Backend is NOT running"
fi

echo ""
echo "2. Frontend Status:"
if pgrep -f "vite" > /dev/null; then
    echo "   ✓ Frontend is running"
else
    echo "   ✗ Frontend is NOT running"
fi

echo ""
echo "3. Backend API Test:"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/trials)
if [ "$RESPONSE" = "200" ]; then
    echo "   ✓ API responding (HTTP $RESPONSE)"
    echo "   Data: $(curl -s http://localhost:8000/trials | jq -r '.[0].name' 2>/dev/null || echo 'Could not parse')"
else
    echo "   ✗ API not responding (HTTP $RESPONSE)"
fi

echo ""
echo "4. CORS Headers:"
curl -s -I -H "Origin: http://localhost:5173" http://localhost:8000/trials | grep -i "access-control"

echo ""
echo "5. Database:"
if [ -f "backend/sorghum.db" ]; then
    echo "   ✓ Database exists ($(stat -c%s backend/sorghum.db) bytes)"
else
    echo "   ✗ Database not found"
fi

echo ""
echo "=== Diagnostic Complete ==="
echo ""
echo "If backend API test passes but frontend shows error,"
echo "open browser DevTools (F12) and check:"
echo "  - Console tab for JavaScript errors"
echo "  - Network tab for failed requests"
