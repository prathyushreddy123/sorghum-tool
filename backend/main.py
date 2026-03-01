import logging
import os
import time
import traceback

from alembic import command
from alembic.config import Config
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import event, text

from config import settings
from database import Base, engine, get_db
import models  # noqa: F401 — registers models with Base.metadata
from middleware import APIKeyMiddleware
from routers import auth, images, observations, plots, rounds, stats, teams, traits, training, trials

logger = logging.getLogger(__name__)

# ─── Slow-query monitor (enable with DEBUG_QUERIES=1) ─────────────────────────
# Logs any SQL query that takes longer than SLOW_QUERY_MS milliseconds.
# Safe to leave configured — does nothing unless the env var is set.
_SLOW_QUERY_MS = int(os.getenv("SLOW_QUERY_MS", "100"))

if os.getenv("DEBUG_QUERIES"):
    logging.basicConfig(level=logging.DEBUG)

    @event.listens_for(engine.sync_engine if hasattr(engine, "sync_engine") else engine, "before_cursor_execute")
    def _before_query(conn, cursor, statement, parameters, context, executemany):
        conn.info.setdefault("_qstart", []).append(time.perf_counter())

    @event.listens_for(engine.sync_engine if hasattr(engine, "sync_engine") else engine, "after_cursor_execute")
    def _after_query(conn, cursor, statement, parameters, context, executemany):
        starts = conn.info.get("_qstart")
        if not starts:
            return
        elapsed_ms = (time.perf_counter() - starts.pop()) * 1000
        if elapsed_ms >= _SLOW_QUERY_MS:
            logger.warning(
                "[SLOW QUERY] %.1fms — %s",
                elapsed_ms,
                statement[:300].replace("\n", " "),
            )
# ──────────────────────────────────────────────────────────────────────────────

# Run Alembic migrations on startup (creates tables if fresh DB)
try:
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    logger.info("Alembic migrations complete.")
except Exception as e:
    logger.error("Alembic migration FAILED: %s\n%s", e, traceback.format_exc())
    logger.warning("Falling back to create_all() — new columns may be missing!")
    Base.metadata.create_all(bind=engine)

# Seed trait library if empty
try:
    from scripts.seed_trait_library import seed_if_empty
    db_gen = get_db()
    db = next(db_gen)
    seed_if_empty(db)
    db.close()
except Exception as e:
    logger.warning(f"Trait library seed skipped: {e}")

logging.basicConfig(level=logging.INFO)

# Start local training runner only if RunPod is NOT configured (dev mode)
if not settings.RUNPOD_ENDPOINT_ID:
    from services.training_runner import start_training_runner, stop_training_runner
    try:
        start_training_runner()
        logger.info("Training job runner started (local dev mode).")
    except Exception as e:
        logger.warning(f"Training runner failed to start: {e}")
else:
    logger.info("RunPod configured — local training runner disabled.")

app = FastAPI(title="FieldScout API", version="0.2.0")


@app.on_event("shutdown")
def shutdown_training_runner():
    if not settings.RUNPOD_ENDPOINT_ID:
        from services.training_runner import stop_training_runner
        stop_training_runner()


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    logger.error("Unhandled exception on %s %s:\n%s", request.method, request.url.path, tb)
    return JSONResponse(status_code=500, content={"detail": str(exc), "type": type(exc).__name__})


cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(APIKeyMiddleware)

app.include_router(auth.router)
app.include_router(teams.router)
app.include_router(trials.router)
app.include_router(plots.router)
app.include_router(observations.router)
app.include_router(stats.router)
app.include_router(images.router)
app.include_router(traits.router)
app.include_router(rounds.router)
app.include_router(training.router)


@app.get("/")
def root():
    return {"message": "FieldScout API", "docs": "/docs"}


@app.get("/health/db")
def db_health(db=Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "db": settings.DATABASE_URL[:30] + "..."}
    except Exception as exc:
        tb = traceback.format_exc()
        logger.error("DB health check failed:\n%s", tb)
        return JSONResponse(status_code=503, content={"status": "error", "detail": str(exc)})
