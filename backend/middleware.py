import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

import crud
import database

# In-memory rate limit store: key_hash -> (count, window_start)
_rate_limits: dict[str, tuple[int, float]] = defaultdict(lambda: (0, 0.0))
RATE_LIMIT = 100  # requests per window
RATE_WINDOW = 60  # seconds


class APIKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        api_key = request.headers.get("X-API-Key")

        if api_key:
            db = database.SessionLocal()
            try:
                key = crud.validate_api_key(db, api_key)
                if not key:
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Invalid API key"},
                    )

                # Rate limiting
                now = time.time()
                count, window_start = _rate_limits[key.key_hash]
                if now - window_start > RATE_WINDOW:
                    _rate_limits[key.key_hash] = (1, now)
                else:
                    if count >= RATE_LIMIT:
                        return JSONResponse(
                            status_code=429,
                            content={"detail": f"Rate limit exceeded ({RATE_LIMIT}/min)"},
                        )
                    _rate_limits[key.key_hash] = (count + 1, window_start)

                request.state.api_key = key
            finally:
                db.close()

        response = await call_next(request)
        return response
