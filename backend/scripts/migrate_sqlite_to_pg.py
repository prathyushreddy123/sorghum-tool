#!/usr/bin/env python3
"""Migrate data from SQLite to PostgreSQL.

Usage:
    # Set the target PostgreSQL URL
    export TARGET_DATABASE_URL="postgresql://user:pass@host/dbname"

    # Run from the backend directory
    python scripts/migrate_sqlite_to_pg.py

This script:
1. Reads all data from the local SQLite database
2. Runs Alembic migrations on the target PostgreSQL database
3. Inserts all data into PostgreSQL, preserving IDs
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from database import engine as sqlite_engine
from models import APIKey, Image, Observation, Plot, Trial, User


TARGET_URL = os.environ.get("TARGET_DATABASE_URL")
if not TARGET_URL:
    print("ERROR: Set TARGET_DATABASE_URL environment variable")
    print("Example: export TARGET_DATABASE_URL='postgresql://user:pass@host/dbname'")
    sys.exit(1)

# Connect to both databases
sqlite_session = sessionmaker(bind=sqlite_engine)()
pg_engine = create_engine(TARGET_URL)

# Run Alembic migrations on target
print("Running Alembic migrations on target database...")
from alembic.config import Config
from alembic import command

alembic_cfg = Config("alembic.ini")
alembic_cfg.set_main_option("sqlalchemy.url", TARGET_URL)
command.upgrade(alembic_cfg, "head")
print("Migrations complete.")

pg_session = sessionmaker(bind=pg_engine)()

# Migration order respects foreign keys
TABLES = [
    ("users", User),
    ("trials", Trial),
    ("plots", Plot),
    ("observations", Observation),
    ("images", Image),
    ("api_keys", APIKey),
]

for table_name, model in TABLES:
    rows = sqlite_session.query(model).all()
    if not rows:
        print(f"  {table_name}: 0 rows (skipping)")
        continue

    # Get column names from model
    columns = [c.name for c in model.__table__.columns]

    for row in rows:
        data = {col: getattr(row, col) for col in columns}
        pg_session.execute(model.__table__.insert().values(**data))

    pg_session.commit()
    print(f"  {table_name}: {len(rows)} rows migrated")

    # Reset sequence to max ID + 1 for PostgreSQL
    if hasattr(model, "id"):
        max_id = max(r.id for r in rows)
        seq_name = f"{table_name}_id_seq"
        try:
            pg_session.execute(text(f"SELECT setval('{seq_name}', {max_id})"))
            pg_session.commit()
        except Exception:
            pg_session.rollback()

sqlite_session.close()
pg_session.close()
print("\nMigration complete!")
