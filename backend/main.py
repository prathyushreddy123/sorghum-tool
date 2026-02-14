import logging

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import Base, engine
import models  # noqa: F401 — registers models with Base.metadata
from middleware import APIKeyMiddleware
from routers import auth, images, observations, plots, stats, trials

logger = logging.getLogger(__name__)

# Run Alembic migrations on startup (creates tables if fresh DB)
try:
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
except Exception as e:
    # Fallback: create tables directly (e.g. in test environments without alembic.ini)
    logger.warning(f"Alembic migration failed ({e}), falling back to create_all()")
    Base.metadata.create_all(bind=engine)

app = FastAPI(title="SorghumField API", version="0.1.0")

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
app.include_router(trials.router)
app.include_router(plots.router)
app.include_router(observations.router)
app.include_router(stats.router)
app.include_router(images.router)


@app.get("/")
def root():
    return {"message": "SorghumField API", "docs": "/docs"}
