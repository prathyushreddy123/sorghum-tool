import csv
import hashlib
import io
import json
import math
import os
import secrets
from collections import Counter
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from config import settings
from models import (
    APIKey, Image, Observation, Plot, PlotAttribute, ScoringRound,
    Trait, Trial, TrialTrait, User,
)

UPLOAD_DIR = settings.UPLOAD_DIR or os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")

# Legacy hardcoded traits kept only for backward-compat validation of old observations
_LEGACY_TRAITS = {"ergot_severity", "flowering_date", "plant_height"}


# ─── Traits ───────────────────────────────────────────────────────────────────

def get_traits(db: Session, crop_hint: str | None = None, search: str | None = None) -> list[Trait]:
    query = db.query(Trait)
    if crop_hint:
        query = query.filter(Trait.crop_hint.ilike(f"%{crop_hint}%"))
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            Trait.label.ilike(pattern) | Trait.name.ilike(pattern) | Trait.description.ilike(pattern)
        )
    return query.order_by(Trait.name).all()


def get_trait(db: Session, trait_id: int) -> Trait | None:
    return db.query(Trait).filter(Trait.id == trait_id).first()


def get_trait_by_name(db: Session, name: str) -> Trait | None:
    return db.query(Trait).filter(Trait.name == name).first()


def create_trait(db: Session, **kwargs) -> Trait:
    trait = Trait(**kwargs)
    db.add(trait)
    db.commit()
    db.refresh(trait)
    return trait


def update_trait(db: Session, trait_id: int, **kwargs) -> Trait | None:
    trait = get_trait(db, trait_id)
    if not trait or trait.is_system:
        return None
    for k, v in kwargs.items():
        setattr(trait, k, v)
    db.commit()
    db.refresh(trait)
    return trait


def delete_trait(db: Session, trait_id: int) -> bool:
    trait = db.query(Trait).filter(Trait.id == trait_id).first()
    if not trait or trait.is_system:
        return False
    db.delete(trait)
    db.commit()
    return True


def validate_observation_value(trait: Trait | None, trait_name: str, value: str) -> str | None:
    """Returns error message if invalid, None if valid.
    Uses dynamic validation when a Trait object is provided; falls back to legacy rules."""
    if trait:
        dt = trait.data_type
        if dt == "categorical":
            cats = json.loads(trait.categories) if trait.categories else []
            if value not in cats:
                return f"{trait.label}: value must be one of {cats}"
        elif dt in ("integer", "float"):
            try:
                num = float(value)
                if trait.min_value is not None and num < trait.min_value:
                    return f"{trait.label}: must be ≥ {trait.min_value}"
                if trait.max_value is not None and num > trait.max_value:
                    return f"{trait.label}: must be ≤ {trait.max_value}"
                if dt == "integer" and not float(value).is_integer():
                    return f"{trait.label}: must be a whole number"
            except ValueError:
                return f"{trait.label}: must be a number"
        elif dt == "date":
            try:
                datetime.strptime(value, "%Y-%m-%d")
            except ValueError:
                return f"{trait.label}: must be YYYY-MM-DD format"
        return None

    # Legacy fallback for old trait_name-only observations
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


# ─── Trial Traits ──────────────────────────────────────────────────────────────

def get_trial_traits(db: Session, trial_id: int) -> list[TrialTrait]:
    return (
        db.query(TrialTrait)
        .filter(TrialTrait.trial_id == trial_id)
        .order_by(TrialTrait.display_order)
        .all()
    )


def add_trait_to_trial(db: Session, trial_id: int, trait_id: int, display_order: int = 0) -> TrialTrait | None:
    existing = (
        db.query(TrialTrait)
        .filter(TrialTrait.trial_id == trial_id, TrialTrait.trait_id == trait_id)
        .first()
    )
    if existing:
        return existing
    tt = TrialTrait(trial_id=trial_id, trait_id=trait_id, display_order=display_order)
    db.add(tt)
    db.commit()
    db.refresh(tt)
    return tt


def bulk_add_traits_to_trial(db: Session, trial_id: int, trait_ids: list[int]) -> list[TrialTrait]:
    results = []
    for order, tid in enumerate(trait_ids):
        tt = add_trait_to_trial(db, trial_id, tid, display_order=order)
        if tt:
            results.append(tt)
    return results


def remove_trait_from_trial(db: Session, trial_id: int, trait_id: int) -> bool:
    tt = (
        db.query(TrialTrait)
        .filter(TrialTrait.trial_id == trial_id, TrialTrait.trait_id == trait_id)
        .first()
    )
    if not tt:
        return False
    db.delete(tt)
    db.commit()
    return True


def reorder_trial_traits(db: Session, trial_id: int, ordered_trait_ids: list[int]) -> list[TrialTrait]:
    for order, tid in enumerate(ordered_trait_ids):
        db.query(TrialTrait).filter(
            TrialTrait.trial_id == trial_id, TrialTrait.trait_id == tid
        ).update({"display_order": order})
    db.commit()
    return get_trial_traits(db, trial_id)


# ─── Scoring Rounds ────────────────────────────────────────────────────────────

def get_scoring_rounds(db: Session, trial_id: int) -> list[ScoringRound]:
    return (
        db.query(ScoringRound)
        .filter(ScoringRound.trial_id == trial_id)
        .order_by(ScoringRound.created_at)
        .all()
    )


def get_scoring_round(db: Session, round_id: int) -> ScoringRound | None:
    return db.query(ScoringRound).filter(ScoringRound.id == round_id).first()


def create_scoring_round(db: Session, trial_id: int, name: str, scored_at=None, notes: str | None = None) -> ScoringRound:
    sr = ScoringRound(trial_id=trial_id, name=name, scored_at=scored_at, notes=notes)
    db.add(sr)
    db.commit()
    db.refresh(sr)
    return sr


def update_scoring_round(db: Session, round_id: int, **kwargs) -> ScoringRound | None:
    sr = get_scoring_round(db, round_id)
    if not sr:
        return None
    for k, v in kwargs.items():
        if v is not None:
            setattr(sr, k, v)
    db.commit()
    db.refresh(sr)
    return sr


def delete_scoring_round(db: Session, round_id: int) -> bool:
    sr = db.query(ScoringRound).filter(ScoringRound.id == round_id).first()
    if not sr:
        return False
    # cascade delete observations in this round
    db.query(Observation).filter(Observation.scoring_round_id == round_id).delete()
    db.delete(sr)
    db.commit()
    return True


def get_round_completion(db: Session, round_id: int, trial_id: int) -> tuple[int, int]:
    """Returns (scored_plots, total_plots) for a round."""
    total = db.query(func.count(Plot.id)).filter(Plot.trial_id == trial_id).scalar() or 0
    scored = (
        db.query(func.count(func.distinct(Observation.plot_id)))
        .join(Plot, Observation.plot_id == Plot.id)
        .filter(Plot.trial_id == trial_id, Observation.scoring_round_id == round_id)
        .scalar()
        or 0
    )
    return scored, total


# ─── Trials ───────────────────────────────────────────────────────────────────

def get_trials(db: Session, user_id: int | None = None) -> list[Trial]:
    query = db.query(Trial)
    if user_id is not None:
        query = query.filter(Trial.user_id == user_id)
    return query.order_by(Trial.created_at.desc()).all()


def get_trial(db: Session, trial_id: int) -> Trial | None:
    return db.query(Trial).filter(Trial.id == trial_id).first()


def create_trial(db: Session, trait_ids: list[int] | None = None, first_round_name: str = "Round 1", **kwargs) -> Trial:
    trial = Trial(**kwargs)
    db.add(trial)
    db.flush()  # get trial.id without committing

    # attach traits
    if trait_ids:
        for order, tid in enumerate(trait_ids):
            db.add(TrialTrait(trial_id=trial.id, trait_id=tid, display_order=order))

    # auto-create first scoring round
    db.add(ScoringRound(trial_id=trial.id, name=first_round_name))

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


def clone_trial(db: Session, source_trial_id: int, first_round_name: str = "Round 1", **kwargs) -> Trial | None:
    source = get_trial(db, source_trial_id)
    if not source:
        return None

    new_trial = Trial(
        name=kwargs.get("name", f"{source.name} (Copy)"),
        crop=source.crop,
        location=kwargs.get("location", source.location),
        start_date=kwargs.get("start_date", source.start_date),
        end_date=kwargs.get("end_date", source.end_date),
        user_id=source.user_id,
    )
    db.add(new_trial)
    db.flush()

    # copy trial traits
    for tt in source.trial_traits:
        db.add(TrialTrait(trial_id=new_trial.id, trait_id=tt.trait_id, display_order=tt.display_order))

    # copy plots (without observations)
    for plot in source.plots:
        new_plot = Plot(
            trial_id=new_trial.id,
            plot_id=plot.plot_id,
            genotype=plot.genotype,
            rep=plot.rep,
            row=plot.row,
            column=plot.column,
            notes=plot.notes,
        )
        db.add(new_plot)
        db.flush()
        for attr in plot.attributes:
            db.add(PlotAttribute(plot_id=new_plot.id, key=attr.key, value=attr.value))

    # create first scoring round
    db.add(ScoringRound(trial_id=new_trial.id, name=first_round_name))

    db.commit()
    db.refresh(new_trial)
    return new_trial


def get_trial_plot_counts(db: Session, trial_id: int) -> tuple[int, int]:
    """Returns (total_plots, scored_plots_any_round) for a trial."""
    total = db.query(func.count(Plot.id)).filter(Plot.trial_id == trial_id).scalar() or 0
    scored = (
        db.query(func.count(func.distinct(Observation.plot_id)))
        .join(Plot, Observation.plot_id == Plot.id)
        .filter(Plot.trial_id == trial_id)
        .scalar()
        or 0
    )
    return total, scored


# ─── Plots ────────────────────────────────────────────────────────────────────

def get_plots(
    db: Session,
    trial_id: int,
    search: str | None = None,
    scored: bool | None = None,
    round_id: int | None = None,
    status: str | None = None,
) -> list[Plot]:
    query = db.query(Plot).filter(Plot.trial_id == trial_id)

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            (Plot.plot_id.ilike(pattern)) | (Plot.genotype.ilike(pattern))
        )

    if status:
        query = query.filter(Plot.plot_status == status)

    if scored is not None and round_id is not None:
        scored_ids = (
            db.query(Observation.plot_id)
            .filter(Observation.scoring_round_id == round_id)
            .distinct()
            .subquery()
        )
        if scored:
            query = query.filter(Plot.id.in_(db.query(scored_ids.c.plot_id)))
        else:
            query = query.filter(~Plot.id.in_(db.query(scored_ids.c.plot_id)))
    elif scored is not None:
        all_scored = db.query(Observation.plot_id).distinct().subquery()
        if scored:
            query = query.filter(Plot.id.in_(db.query(all_scored.c.plot_id)))
        else:
            query = query.filter(~Plot.id.in_(db.query(all_scored.c.plot_id)))

    return query.order_by(Plot.row, Plot.column).all()


def get_plot(db: Session, plot_id: int) -> Plot | None:
    return db.query(Plot).filter(Plot.id == plot_id).first()


def create_plot(db: Session, trial_id: int, **kwargs) -> Plot:
    plot = Plot(trial_id=trial_id, **kwargs)
    db.add(plot)
    db.commit()
    db.refresh(plot)
    return plot


def update_plot_status(db: Session, plot_id: int, status: str) -> Plot | None:
    plot = get_plot(db, plot_id)
    if not plot:
        return None
    plot.plot_status = status
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
    """Parse CSV and bulk-insert plots. Required columns: plot_id, genotype, rep, row, column.
    Any extra columns are stored as PlotAttributes."""
    reader = csv.DictReader(io.StringIO(file_content))
    imported = 0
    errors: list[str] = []
    required = {"plot_id", "genotype", "rep", "row", "column"}

    if not reader.fieldnames or not required.issubset({f.strip() for f in reader.fieldnames}):
        return 0, [f"CSV must have headers: {', '.join(sorted(required))}"]

    # Identify extra columns (custom attributes)
    extra_cols = [f.strip() for f in (reader.fieldnames or []) if f.strip() not in required]

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
            db.flush()
            for col in extra_cols:
                val = row.get(col, "").strip()
                if val:
                    db.add(PlotAttribute(plot_id=plot.id, key=col, value=val))
            imported += 1
        except (ValueError, KeyError) as e:
            errors.append(f"Row {i}: {e}")

    if imported > 0:
        db.commit()
    return imported, errors


def plot_has_observations(db: Session, plot_id: int, round_id: int | None = None) -> bool:
    query = db.query(Observation).filter(Observation.plot_id == plot_id)
    if round_id is not None:
        query = query.filter(Observation.scoring_round_id == round_id)
    return query.first() is not None


def get_next_unscored_plot(
    db: Session, trial_id: int, current_plot_id: int, round_id: int | None = None
) -> int | None:
    """Find next active plot (by row, then column) after current with no observations in the given round."""
    current = db.query(Plot).filter(Plot.id == current_plot_id).first()
    if not current:
        return None

    # only consider active plots
    base_query = db.query(Plot).filter(Plot.trial_id == trial_id, Plot.plot_status == "active")

    if round_id is not None:
        scored_ids = (
            db.query(Observation.plot_id)
            .filter(Observation.scoring_round_id == round_id)
            .distinct()
            .subquery()
        )
    else:
        scored_ids = db.query(Observation.plot_id).distinct().subquery()

    unscored_query = base_query.filter(~Plot.id.in_(db.query(scored_ids.c.plot_id)))

    next_plot = (
        unscored_query
        .filter(
            (Plot.row > current.row)
            | ((Plot.row == current.row) & (Plot.column > current.column))
        )
        .order_by(Plot.row, Plot.column)
        .first()
    )

    if next_plot:
        return next_plot.id

    # Wrap around
    wrap_plot = unscored_query.order_by(Plot.row, Plot.column).first()
    return wrap_plot.id if wrap_plot else None


# ─── Plot Attributes ──────────────────────────────────────────────────────────

def get_plot_attributes(db: Session, plot_id: int) -> list[PlotAttribute]:
    return db.query(PlotAttribute).filter(PlotAttribute.plot_id == plot_id).all()


def set_plot_attribute(db: Session, plot_id: int, key: str, value: str) -> PlotAttribute:
    existing = (
        db.query(PlotAttribute)
        .filter(PlotAttribute.plot_id == plot_id, PlotAttribute.key == key)
        .first()
    )
    if existing:
        existing.value = value
        db.commit()
        db.refresh(existing)
        return existing
    attr = PlotAttribute(plot_id=plot_id, key=key, value=value)
    db.add(attr)
    db.commit()
    db.refresh(attr)
    return attr


def delete_plot_attribute(db: Session, plot_id: int, key: str) -> bool:
    attr = (
        db.query(PlotAttribute)
        .filter(PlotAttribute.plot_id == plot_id, PlotAttribute.key == key)
        .first()
    )
    if not attr:
        return False
    db.delete(attr)
    db.commit()
    return True


# ─── Observations ─────────────────────────────────────────────────────────────

def get_observations(db: Session, plot_id: int, round_id: int | None = None) -> list[Observation]:
    query = db.query(Observation).filter(Observation.plot_id == plot_id)
    if round_id is not None:
        query = query.filter(Observation.scoring_round_id == round_id)
    return query.order_by(Observation.recorded_at.desc()).all()


def create_observation(
    db: Session,
    plot_id: int,
    trait_name: str,
    value: str,
    trait_id: int | None = None,
    scoring_round_id: int | None = None,
    notes: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    temperature: float | None = None,
    humidity: float | None = None,
) -> Observation:
    obs = Observation(
        plot_id=plot_id,
        trait_id=trait_id,
        scoring_round_id=scoring_round_id,
        trait_name=trait_name,
        value=value,
        notes=notes,
        latitude=latitude,
        longitude=longitude,
        temperature=temperature,
        humidity=humidity,
    )
    db.add(obs)
    db.commit()
    db.refresh(obs)
    return obs


def update_observation(
    db: Session, observation_id: int, value: str | None = None, notes: str | None = None
) -> Observation | None:
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
    db: Session, plot_id: int, items: list[dict], scoring_round_id: int | None = None
) -> list[Observation]:
    """Create or update observations for a plot within a scoring round.
    One observation per (trait, round) — overwrites existing within the same round."""
    results = []
    for item in items:
        trait_id = item.get("trait_id")
        trait_name = item.get("trait_name", "")
        round_id = scoring_round_id or item.get("scoring_round_id")

        # resolve trait_name from trait_id if needed
        if trait_id and not trait_name:
            trait = db.query(Trait).filter(Trait.id == trait_id).first()
            trait_name = trait.name if trait else ""

        existing_query = db.query(Observation).filter(Observation.plot_id == plot_id)
        if trait_id:
            existing_query = existing_query.filter(Observation.trait_id == trait_id)
        else:
            existing_query = existing_query.filter(Observation.trait_name == trait_name)
        if round_id:
            existing_query = existing_query.filter(Observation.scoring_round_id == round_id)

        existing = existing_query.first()

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
                trait_id=trait_id,
                scoring_round_id=round_id,
                trait_name=trait_name,
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


# ─── API Keys ─────────────────────────────────────────────────────────────────

def generate_api_key() -> tuple[str, str]:
    raw_key = f"fs_{secrets.token_hex(24)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    return raw_key, key_hash


def create_api_key(db: Session, user_label: str) -> tuple[APIKey, str]:
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


# ─── Images ───────────────────────────────────────────────────────────────────

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
    db.delete(img)
    db.commit()
    return True


# ─── Stats ────────────────────────────────────────────────────────────────────

def get_trial_stats(db: Session, trial_id: int, round_id: int | None = None) -> dict:
    total_plots, _ = get_trial_plot_counts(db, trial_id)

    # scored plots in this round (or any round)
    scored_query = (
        db.query(func.count(func.distinct(Observation.plot_id)))
        .join(Plot, Observation.plot_id == Plot.id)
        .filter(Plot.trial_id == trial_id)
    )
    if round_id is not None:
        scored_query = scored_query.filter(Observation.scoring_round_id == round_id)
    scored_plots = scored_query.scalar() or 0

    trial_traits = get_trial_traits(db, trial_id)
    trait_stats = []

    for tt in trial_traits:
        trait = tt.trait
        obs_query = (
            db.query(Observation.value)
            .join(Plot, Observation.plot_id == Plot.id)
            .filter(Plot.trial_id == trial_id, Observation.trait_id == trait.id)
        )
        if round_id is not None:
            obs_query = obs_query.filter(Observation.scoring_round_id == round_id)
        values = [row[0] for row in obs_query.all()]

        stat: dict = {
            "trait_id": trait.id,
            "trait_name": trait.name,
            "trait_label": trait.label,
            "data_type": trait.data_type,
            "unit": trait.unit,
            "count": len(values),
            "total_plots": total_plots,
        }

        if trait.data_type in ("integer", "float") and values:
            nums = [float(v) for v in values if _is_numeric(v)]
            if nums:
                n = len(nums)
                mean = sum(nums) / n
                sd = math.sqrt(sum((v - mean) ** 2 for v in nums) / n) if n > 1 else 0.0
                stat.update({
                    "mean": round(mean, 3),
                    "sd": round(sd, 3),
                    "min_value": min(nums),
                    "max_value": max(nums),
                })

        elif trait.data_type == "categorical" and values:
            cats = json.loads(trait.categories) if trait.categories else []
            labels = json.loads(trait.category_labels) if trait.category_labels else []
            label_map = dict(zip(cats, labels)) if labels else {}
            counts = Counter(values)
            stat["distribution"] = [
                {"value": c, "label": label_map.get(c), "count": counts.get(c, 0)}
                for c in (cats if cats else sorted(set(values)))
            ]

        elif trait.data_type == "date" and values:
            sorted_dates = sorted(v for v in values if v)
            if sorted_dates:
                stat["earliest"] = sorted_dates[0]
                stat["latest"] = sorted_dates[-1]

        trait_stats.append(stat)

    return {
        "trial_id": trial_id,
        "round_id": round_id,
        "total_plots": total_plots,
        "scored_plots": scored_plots,
        "traits": trait_stats,
    }


def _is_numeric(value: str) -> bool:
    try:
        float(value)
        return True
    except ValueError:
        return False


# ─── Heatmap ──────────────────────────────────────────────────────────────────

def get_trial_heatmap(db: Session, trial_id: int, trait_id: int | None = None, round_id: int | None = None) -> dict:
    plots = (
        db.query(Plot)
        .filter(Plot.trial_id == trial_id)
        .order_by(Plot.row, Plot.column)
        .all()
    )

    # Determine which trait to display
    selected_trait: Trait | None = None
    if trait_id:
        selected_trait = db.query(Trait).filter(Trait.id == trait_id).first()
    else:
        # default to first categorical trait in the trial
        tt = (
            db.query(TrialTrait)
            .join(Trait, TrialTrait.trait_id == Trait.id)
            .filter(TrialTrait.trial_id == trial_id, Trait.data_type == "categorical")
            .order_by(TrialTrait.display_order)
            .first()
        )
        if tt:
            selected_trait = tt.trait
            trait_id = tt.trait_id

    # Build value map for selected trait + round
    value_map: dict[int, str] = {}
    if selected_trait:
        obs_query = (
            db.query(Observation.plot_id, Observation.value)
            .join(Plot, Observation.plot_id == Plot.id)
            .filter(Plot.trial_id == trial_id, Observation.trait_id == trait_id)
        )
        if round_id:
            obs_query = obs_query.filter(Observation.scoring_round_id == round_id)
        for plot_id, value in obs_query.all():
            value_map[plot_id] = value

    max_row = max((p.row for p in plots), default=0)
    max_col = max((p.column for p in plots), default=0)

    cells = []
    for p in plots:
        raw_value = value_map.get(p.id)
        numeric_value: float | None = None
        if raw_value is not None and selected_trait:
            if selected_trait.data_type in ("integer", "float", "categorical"):
                try:
                    numeric_value = float(raw_value)
                except ValueError:
                    pass

        cells.append({
            "plot_id": p.plot_id,
            "plot_pk": p.id,
            "row": p.row,
            "column": p.column,
            "genotype": p.genotype,
            "plot_status": p.plot_status,
            "value": raw_value,
            "numeric_value": numeric_value,
        })

    return {
        "rows": max_row,
        "columns": max_col,
        "cells": cells,
        "trait": selected_trait,
        "round_id": round_id,
    }


# ─── Export ───────────────────────────────────────────────────────────────────

def export_trial_csv(db: Session, trial_id: int, round_id: int | None = None) -> str:
    """Export trial data as wide CSV. One row per plot, trait observations as columns."""
    plots = (
        db.query(Plot)
        .filter(Plot.trial_id == trial_id)
        .order_by(Plot.row, Plot.column)
        .all()
    )
    trial_traits = get_trial_traits(db, trial_id)
    trait_names = [tt.trait.name for tt in trial_traits]

    output = io.StringIO()
    writer = csv.writer(output)

    # header: fixed cols + round_col + trait cols + meta cols
    header = ["plot_id", "genotype", "rep", "row", "column", "plot_status"]
    if round_id is not None:
        header.append("scoring_round")
    header += trait_names + ["latitude", "longitude", "temperature", "humidity", "notes", "recorded_at"]
    writer.writerow(header)

    for plot in plots:
        # fetch observations for this plot (optionally filtered by round)
        obs_query = db.query(Observation).filter(Observation.plot_id == plot.id)
        if round_id is not None:
            obs_query = obs_query.filter(Observation.scoring_round_id == round_id)
        observations = obs_query.all()

        obs_by_trait: dict[str, Observation] = {}
        for obs in observations:
            obs_by_trait[obs.trait_name] = obs

        latest_obs = max(observations, key=lambda o: o.recorded_at) if observations else None

        row_data = [
            plot.plot_id, plot.genotype, plot.rep, plot.row, plot.column, plot.plot_status,
        ]
        if round_id is not None:
            round_obj = get_scoring_round(db, round_id)
            row_data.append(round_obj.name if round_obj else "")

        for tname in trait_names:
            row_data.append(obs_by_trait[tname].value if tname in obs_by_trait else "")

        row_data += [
            latest_obs.latitude if latest_obs and latest_obs.latitude is not None else "",
            latest_obs.longitude if latest_obs and latest_obs.longitude is not None else "",
            latest_obs.temperature if latest_obs and latest_obs.temperature is not None else "",
            latest_obs.humidity if latest_obs and latest_obs.humidity is not None else "",
            latest_obs.notes if latest_obs and latest_obs.notes else "",
            latest_obs.recorded_at.isoformat() if latest_obs else "",
        ]
        writer.writerow(row_data)

    return output.getvalue()
