import csv
import hashlib
import io
import math
import os
import secrets
from collections import Counter
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import APIKey, Image, Observation, Plot, Trial

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")


# --- Trials ---

def get_trials(db: Session) -> list[Trial]:
    return db.query(Trial).order_by(Trial.created_at.desc()).all()


def get_trial(db: Session, trial_id: int) -> Trial | None:
    return db.query(Trial).filter(Trial.id == trial_id).first()


def create_trial(db: Session, **kwargs) -> Trial:
    trial = Trial(**kwargs)
    db.add(trial)
    db.commit()
    db.refresh(trial)
    return trial


def delete_trial(db: Session, trial_id: int) -> bool:
    trial = db.query(Trial).filter(Trial.id == trial_id).first()
    if not trial:
        return False
    db.delete(trial)
    db.commit()
    return True


def get_trial_plot_counts(db: Session, trial_id: int) -> tuple[int, int]:
    """Returns (total_plots, scored_plots) for a trial."""
    total = db.query(func.count(Plot.id)).filter(Plot.trial_id == trial_id).scalar() or 0
    scored = (
        db.query(func.count(func.distinct(Observation.plot_id)))
        .join(Plot, Observation.plot_id == Plot.id)
        .filter(Plot.trial_id == trial_id)
        .scalar()
        or 0
    )
    return total, scored


# --- Plots ---

def get_plots(
    db: Session,
    trial_id: int,
    search: str | None = None,
    scored: bool | None = None,
) -> list[Plot]:
    query = db.query(Plot).filter(Plot.trial_id == trial_id)

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            (Plot.plot_id.ilike(pattern)) | (Plot.genotype.ilike(pattern))
        )

    if scored is True:
        query = query.filter(
            Plot.id.in_(db.query(Observation.plot_id).distinct())
        )
    elif scored is False:
        query = query.filter(
            ~Plot.id.in_(db.query(Observation.plot_id).distinct())
        )

    return query.order_by(Plot.row, Plot.column).all()


def get_plot(db: Session, plot_id: int) -> Plot | None:
    return db.query(Plot).filter(Plot.id == plot_id).first()


def create_plot(db: Session, trial_id: int, **kwargs) -> Plot:
    plot = Plot(trial_id=trial_id, **kwargs)
    db.add(plot)
    db.commit()
    db.refresh(plot)
    return plot


def delete_plot(db: Session, plot_id: int) -> bool:
    plot = db.query(Plot).filter(Plot.id == plot_id).first()
    if not plot:
        return False
    db.delete(plot)
    db.commit()
    return True


def import_plots_csv(db: Session, trial_id: int, file_content: str) -> tuple[int, list[str]]:
    """Parse CSV and bulk-insert plots. Returns (imported_count, errors)."""
    reader = csv.DictReader(io.StringIO(file_content))
    imported = 0
    errors: list[str] = []
    required = {"plot_id", "genotype", "rep", "row", "column"}

    if not reader.fieldnames or not required.issubset({f.strip() for f in reader.fieldnames}):
        return 0, [f"CSV must have headers: {', '.join(sorted(required))}"]

    for i, row in enumerate(reader, start=2):
        try:
            plot = Plot(
                trial_id=trial_id,
                plot_id=row["plot_id"].strip(),
                genotype=row["genotype"].strip(),
                rep=int(row["rep"].strip()),
                row=int(row["row"].strip()),
                column=int(row["column"].strip()),
            )
            db.add(plot)
            imported += 1
        except (ValueError, KeyError) as e:
            errors.append(f"Row {i}: {e}")

    if imported > 0:
        db.commit()
    return imported, errors


def get_next_unscored_plot(db: Session, trial_id: int, current_plot_id: int) -> int | None:
    """Find next plot (by row, then column) after current that has no observations."""
    current = db.query(Plot).filter(Plot.id == current_plot_id).first()
    if not current:
        return None

    scored_ids = db.query(Observation.plot_id).distinct().subquery()

    next_plot = (
        db.query(Plot)
        .filter(
            Plot.trial_id == trial_id,
            ~Plot.id.in_(db.query(scored_ids.c.plot_id)),
            (
                (Plot.row > current.row)
                | ((Plot.row == current.row) & (Plot.column > current.column))
            ),
        )
        .order_by(Plot.row, Plot.column)
        .first()
    )

    if next_plot:
        return next_plot.id

    # Wrap around: find first unscored plot from the beginning
    wrap_plot = (
        db.query(Plot)
        .filter(
            Plot.trial_id == trial_id,
            ~Plot.id.in_(db.query(scored_ids.c.plot_id)),
        )
        .order_by(Plot.row, Plot.column)
        .first()
    )
    return wrap_plot.id if wrap_plot else None


def plot_has_observations(db: Session, plot_id: int) -> bool:
    return db.query(Observation).filter(Observation.plot_id == plot_id).first() is not None


# --- Observations ---

VALID_TRAITS = {"ergot_severity", "flowering_date", "plant_height"}


def validate_observation_value(trait_name: str, value: str) -> str | None:
    """Returns error message if invalid, None if valid."""
    if trait_name == "ergot_severity":
        if value not in {"1", "2", "3", "4", "5"}:
            return "ergot_severity must be 1-5"
    elif trait_name == "flowering_date":
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return "flowering_date must be YYYY-MM-DD format"
    elif trait_name == "plant_height":
        try:
            h = int(value)
            if h < 50 or h > 400:
                return "plant_height must be 50-400"
        except ValueError:
            return "plant_height must be an integer"
    return None


def get_observations(db: Session, plot_id: int) -> list[Observation]:
    return (
        db.query(Observation)
        .filter(Observation.plot_id == plot_id)
        .order_by(Observation.recorded_at.desc())
        .all()
    )


def create_observation(
    db: Session, plot_id: int, trait_name: str, value: str,
    notes: str | None = None, latitude: float | None = None, longitude: float | None = None,
    temperature: float | None = None, humidity: float | None = None,
) -> Observation:
    obs = Observation(
        plot_id=plot_id, trait_name=trait_name, value=value, notes=notes,
        latitude=latitude, longitude=longitude,
        temperature=temperature, humidity=humidity,
    )
    db.add(obs)
    db.commit()
    db.refresh(obs)
    return obs


def update_observation(db: Session, observation_id: int, value: str | None = None, notes: str | None = None) -> Observation | None:
    obs = db.query(Observation).filter(Observation.id == observation_id).first()
    if not obs:
        return None
    if value is not None:
        obs.value = value
    if notes is not None:
        obs.notes = notes
    db.commit()
    db.refresh(obs)
    return obs


def bulk_create_observations(
    db: Session, plot_id: int, items: list[dict]
) -> list[Observation]:
    """Create or update observations for a plot. One observation per trait — overwrites existing."""
    results = []
    for item in items:
        existing = (
            db.query(Observation)
            .filter(Observation.plot_id == plot_id, Observation.trait_name == item["trait_name"])
            .first()
        )
        if existing:
            existing.value = item["value"]
            existing.notes = item.get("notes")
            existing.latitude = item.get("latitude")
            existing.longitude = item.get("longitude")
            existing.temperature = item.get("temperature")
            existing.humidity = item.get("humidity")
            existing.recorded_at = func.now()
            db.flush()
            results.append(existing)
        else:
            obs = Observation(
                plot_id=plot_id,
                trait_name=item["trait_name"],
                value=item["value"],
                notes=item.get("notes"),
                latitude=item.get("latitude"),
                longitude=item.get("longitude"),
                temperature=item.get("temperature"),
                humidity=item.get("humidity"),
            )
            db.add(obs)
            db.flush()
            results.append(obs)
    db.commit()
    for r in results:
        db.refresh(r)
    return results


# --- API Keys ---

def generate_api_key() -> tuple[str, str]:
    """Generate a raw API key and its SHA-256 hash. Returns (raw_key, key_hash)."""
    raw_key = f"sf_{secrets.token_hex(24)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    return raw_key, key_hash


def create_api_key(db: Session, user_label: str) -> tuple[APIKey, str]:
    """Create an API key. Returns (model, raw_key)."""
    raw_key, key_hash = generate_api_key()
    key = APIKey(user_label=user_label, key_hash=key_hash)
    db.add(key)
    db.commit()
    db.refresh(key)
    return key, raw_key


def get_api_keys(db: Session) -> list[APIKey]:
    return db.query(APIKey).filter(APIKey.is_active == True).order_by(APIKey.created_at.desc()).all()  # noqa: E712


def validate_api_key(db: Session, raw_key: str) -> APIKey | None:
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key = db.query(APIKey).filter(APIKey.key_hash == key_hash, APIKey.is_active == True).first()  # noqa: E712
    if key:
        key.last_used_at = func.now()
        db.commit()
    return key


def revoke_api_key(db: Session, key_id: int) -> bool:
    key = db.query(APIKey).filter(APIKey.id == key_id).first()
    if not key:
        return False
    key.is_active = False
    db.commit()
    return True


# --- Images ---

def ensure_upload_dir():
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def create_image(db: Session, plot_id: int, filename: str, original_name: str, image_type: str = "panicle") -> Image:
    img = Image(plot_id=plot_id, filename=filename, original_name=original_name, image_type=image_type)
    db.add(img)
    db.commit()
    db.refresh(img)
    return img


def get_images(db: Session, plot_id: int, image_type: str | None = None) -> list[Image]:
    query = db.query(Image).filter(Image.plot_id == plot_id)
    if image_type:
        query = query.filter(Image.image_type == image_type)
    return query.order_by(Image.uploaded_at.desc()).all()


def delete_image(db: Session, image_id: int) -> bool:
    img = db.query(Image).filter(Image.id == image_id).first()
    if not img:
        return False
    filepath = os.path.join(UPLOAD_DIR, img.filename)
    if os.path.exists(filepath):
        os.remove(filepath)
    db.delete(img)
    db.commit()
    return True


# --- Stats ---

def get_trial_stats(db: Session, trial_id: int) -> dict:
    total_plots, scored_plots = get_trial_plot_counts(db, trial_id)

    # Gather observations joined with plots for this trial
    obs_rows = (
        db.query(Observation.trait_name, Observation.value)
        .join(Plot, Observation.plot_id == Plot.id)
        .filter(Plot.trial_id == trial_id)
        .all()
    )

    ergot_vals: list[float] = []
    height_vals: list[float] = []
    date_vals: list[str] = []

    for trait_name, value in obs_rows:
        if trait_name == "ergot_severity":
            ergot_vals.append(float(value))
        elif trait_name == "plant_height":
            height_vals.append(float(value))
        elif trait_name == "flowering_date":
            date_vals.append(value)

    def numeric_stats(vals: list[float]) -> dict:
        if not vals:
            return {"count": 0, "mean": None, "sd": None, "min": None, "max": None}
        n = len(vals)
        mean = sum(vals) / n
        sd = math.sqrt(sum((v - mean) ** 2 for v in vals) / n) if n > 1 else 0.0
        return {
            "count": n,
            "mean": round(mean, 2),
            "sd": round(sd, 2),
            "min": min(vals),
            "max": max(vals),
        }

    def date_stats(vals: list[str]) -> dict:
        if not vals:
            return {"count": 0, "earliest": None, "latest": None}
        sorted_dates = sorted(vals)
        return {"count": len(vals), "earliest": sorted_dates[0], "latest": sorted_dates[-1]}

    ergot_counts = Counter(int(v) for v in ergot_vals)
    ergot_distribution = [
        {"score": s, "count": ergot_counts.get(s, 0)}
        for s in range(1, 6)
    ]

    return {
        "total_plots": total_plots,
        "scored_plots": scored_plots,
        "traits": {
            "ergot_severity": numeric_stats(ergot_vals),
            "plant_height": numeric_stats(height_vals),
            "flowering_date": date_stats(date_vals),
        },
        "ergot_distribution": ergot_distribution,
    }


# --- Heatmap ---

def get_trial_heatmap(db: Session, trial_id: int) -> dict:
    plots = (
        db.query(Plot)
        .filter(Plot.trial_id == trial_id)
        .order_by(Plot.row, Plot.column)
        .all()
    )

    ergot_obs = (
        db.query(Observation.plot_id, Observation.value)
        .join(Plot, Observation.plot_id == Plot.id)
        .filter(Plot.trial_id == trial_id, Observation.trait_name == "ergot_severity")
        .all()
    )
    severity_map = {plot_id: int(value) for plot_id, value in ergot_obs}

    max_row = max((p.row for p in plots), default=0)
    max_col = max((p.column for p in plots), default=0)

    cells = [
        {
            "plot_id": p.plot_id,
            "plot_pk": p.id,
            "row": p.row,
            "column": p.column,
            "genotype": p.genotype,
            "ergot_severity": severity_map.get(p.id),
        }
        for p in plots
    ]

    return {"rows": max_row, "columns": max_col, "cells": cells}


# --- Export ---

def export_trial_csv(db: Session, trial_id: int) -> str:
    """Export trial data as CSV string. One row per plot, observations pivoted into columns."""
    plots = (
        db.query(Plot)
        .filter(Plot.trial_id == trial_id)
        .order_by(Plot.row, Plot.column)
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "plot_id", "genotype", "rep", "row", "column",
        "ergot_severity", "flowering_date", "plant_height",
        "latitude", "longitude", "temperature", "humidity",
        "notes", "recorded_at",
    ])

    for plot in plots:
        obs_map: dict[str, Observation] = {}
        for obs in plot.observations:
            obs_map[obs.trait_name] = obs

        # Use the most recent recorded_at and notes from any observation
        latest_obs = max(plot.observations, key=lambda o: o.recorded_at) if plot.observations else None

        writer.writerow([
            plot.plot_id,
            plot.genotype,
            plot.rep,
            plot.row,
            plot.column,
            obs_map.get("ergot_severity", _empty()).value if "ergot_severity" in obs_map else "",
            obs_map.get("flowering_date", _empty()).value if "flowering_date" in obs_map else "",
            obs_map.get("plant_height", _empty()).value if "plant_height" in obs_map else "",
            latest_obs.latitude if latest_obs and latest_obs.latitude is not None else "",
            latest_obs.longitude if latest_obs and latest_obs.longitude is not None else "",
            latest_obs.temperature if latest_obs and latest_obs.temperature is not None else "",
            latest_obs.humidity if latest_obs and latest_obs.humidity is not None else "",
            latest_obs.notes if latest_obs and latest_obs.notes else "",
            latest_obs.recorded_at.isoformat() if latest_obs else "",
        ])

    return output.getvalue()


class _empty:
    value = ""
