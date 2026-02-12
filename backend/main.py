from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from database import Base, engine
import models  # noqa: F401 — registers models with Base.metadata
from middleware import APIKeyMiddleware
from routers import auth, images, observations, plots, stats, trials

Base.metadata.create_all(bind=engine)

# Idempotent migrations for columns added after initial schema
with engine.connect() as _conn:
    _columns = [c["name"] for c in inspect(engine).get_columns("images")]
    if "image_type" not in _columns:
        _conn.execute(text("ALTER TABLE images ADD COLUMN image_type VARCHAR NOT NULL DEFAULT 'panicle'"))
        _conn.commit()

app = FastAPI(title="SorghumField API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
