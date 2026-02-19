import csv
import hashlib
import io
import json
import math
import os
import secrets
from collections import Counter
from datetime import datetime

from sqlalchemy import Float as SAFloat, cast, func
from sqlalchemy.orm import Session

from config import settings
from models import (
    APIKey, Image, Observation, Plot, PlotAttribute, ScoringRound,
    Team, TeamMember, Trait, Trial, TrialTrait, User,
)

UPLOAD_DIR = settings.UPLOAD_DIR or os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")

# Legacy hardcoded traits kept only for backward-compat validation of old observations
_LEGACY_TRAITS = {"ergot_severity", "flowering_date", "plant_height"}


# ─── Teams ────────────────────────────────────────────────────────────────────

def _generate_invite_code() -> str:
    """Generate a short, readable invite code like 'ABCD-1234'."""
    import random
    import string
    part1 = ''.join(random.choices(string.ascii_uppercase, k=4))
    part2 = ''.join(random.choices(string.digits, k=4))
    return f"{part1}-{part2}"


def create_team(db: Session, name: str, creator_id: int) -> Team:
    code = _generate_invite_code()
    while db.query(Team).filter(Team.invite_code == code).first():
        code = _generate_invite_code()
    team = Team(name=name, invite_code=code, created_by=creator_id)
    db.add(team)
    db.flush()
    db.add(TeamMember(team_id=team.id, user_id=creator_id))
    db.commit()
    db.refresh(team)
    return team


def get_team(db: Session, team_id: int) -> Team | None:
    return db.query(Team).filter(Team.id == team_id).first()


def get_team_by_invite_code(db: Session, invite_code: str) -> Team | None:
    return db.query(Team).filter(Team.invite_code == invite_code.strip().upper()).first()


def get_user_teams(db: Session, user_id: int) -> list[Team]:
    return (
        db.query(Team)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(TeamMember.user_id == user_id)
        .order_by(Team.name)
        .all()
    )


def join_team(db: Session, team_id: int, user_id: int) -> TeamMember | None:
    existing = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        .first()
    )
    if existing:
        return existing
    member = TeamMember(team_id=team_id, user_id=user_id)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def leave_team(db: Session, team_id: int, user_id: int) -> bool:
    member = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        .first()
    )
    if not member:
        return False
    db.delete(member)
    db.commit()
    return True


def remove_team_member(db: Session, team_id: int, user_id: int) -> bool:
    return leave_team(db, team_id, user_id)


def get_team_members(db: Session, team_id: int) -> list[TeamMember]:
    return (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team_id)
        .order_by(TeamMember.joined_at)
        .all()
    )


def is_team_member(db: Session, team_id: int, user_id: int) -> bool:
    return (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        .first()
    ) is not None


def delete_team(db: Session, team_id: int) -> bool:
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        return False
    db.query(Trial).filter(Trial.team_id == team_id).update({"team_id": None})
    db.delete(team)
    db.commit()
    return True


def regenerate_invite_code(db: Session, team_id: int) -> Team | None:
    team = get_team(db, team_id)
    if not team:
        return None
    code = _generate_invite_code()
    while db.query(Team).filter(Team.invite_code == code).first():
        code = _generate_invite_code()
    team.invite_code = code
    db.commit()
    db.refresh(team)
    return team


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

def get_trials(db: Session, user_id: int | None = None, team_id: int | None = None) -> list[Trial]:
    query = db.query(Trial)
    if team_id is not None:
        query = query.filter(Trial.team_id == team_id)
    elif user_id is not None:
        query = query.filter(Trial.user_id == user_id)
    else:
        return []  # No identity = no trials (prevents unauthenticated data leak)
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
        team_id=source.team_id,
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


def get_trial_plot_counts_bulk(
    db: Session, trial_ids: list[int]
) -> dict[int, tuple[int, int]]:
    """Returns {trial_id: (total_plots, scored_plots)} in exactly 2 queries
    regardless of how many trials are passed, replacing the N+1 pattern in
    list_trials where _enrich_trial_response was called per trial.
    """
    if not trial_ids:
        return {}

    # Query 1: total plots grouped by trial
    total_rows = (
        db.query(Plot.trial_id, func.count(Plot.id).label("total"))
        .filter(Plot.trial_id.in_(trial_ids))
        .group_by(Plot.trial_id)
        .all()
    )
    totals = {row.trial_id: row.total for row in total_rows}

    # Query 2: distinct scored plots grouped by trial
    scored_rows = (
        db.query(Plot.trial_id, func.count(func.distinct(Observation.plot_id)).label("scored"))
        .join(Plot, Observation.plot_id == Plot.id)
        .filter(Plot.trial_id.in_(trial_ids))
        .group_by(Plot.trial_id)
        .all()
    )
    scored = {row.trial_id: row.scored for row in scored_rows}

    return {
        trial_id: (totals.get(trial_id, 0), scored.get(trial_id, 0))
        for trial_id in trial_ids
    }


# ─── Walk-mode sorting ─────────────────────────────────────────────────────────

def sort_plots_by_walk_mode(plots: list[Plot], walk_mode: str) -> list[Plot]:
    """Re-order plots according to the chosen field-walk pattern."""
    if walk_mode == "serpentine":
        def _serpentine_key(p: Plot) -> tuple[int, int]:
            col = p.column if p.row % 2 == 1 else -p.column
            return (p.row, col)
        return sorted(plots, key=_serpentine_key)

    if walk_mode == "column_by_column":
        return sorted(plots, key=lambda p: (p.column, p.row))

    return sorted(plots, key=lambda p: (p.row, p.column))


# ─── Plots ────────────────────────────────────────────────────────────────────

def get_plots(
    db: Session,
    trial_id: int,
    search: str | None = None,
    scored: bool | None = None,
    round_id: int | None = None,
    status: str | None = None,
    walk_mode: str | None = None,
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

    plots = query.order_by(Plot.row, Plot.column).all()

    if walk_mode and walk_mode != "row_by_row":
        plots = sort_plots_by_walk_mode(plots, walk_mode)

    return plots


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


def get_plots_observed_set(
    db: Session, plot_ids: list[int], round_id: int | None = None
) -> set[int]:
    """Return the set of plot IDs (from the given list) that have at least one observation.

    Runs a single query regardless of how many plots are passed, replacing the
    previous N+1 pattern (one query per plot) in list_plots.
    """
    if not plot_ids:
        return set()
    query = (
        db.query(Observation.plot_id)
        .filter(Observation.plot_id.in_(plot_ids))
        .distinct()
    )
    if round_id is not None:
        query = query.filter(Observation.scoring_round_id == round_id)
    return {row[0] for row in query.all()}


def get_next_unscored_plot(
    db: Session, trial_id: int, current_plot_id: int,
    round_id: int | None = None, walk_mode: str = "row_by_row",
) -> int | None:
    """Find next unscored active plot after current, respecting walk order."""
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

    unscored = base_query.filter(~Plot.id.in_(db.query(scored_ids.c.plot_id))).all()
    if not unscored:
        return None

    all_plots = sort_plots_by_walk_mode(
        db.query(Plot).filter(Plot.trial_id == trial_id).all(), walk_mode
    )
    ordered_ids = [p.id for p in all_plots]
    unscored_ids = {p.id for p in unscored}

    try:
        cur_idx = ordered_ids.index(current_plot_id)
    except ValueError:
        return unscored[0].id if unscored else None

    # Search forward from current position, then wrap around
    for i in range(1, len(ordered_ids)):
        candidate = ordered_ids[(cur_idx + i) % len(ordered_ids)]
        if candidate in unscored_ids:
            return candidate

    return None


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

        # Shared filter conditions for this trait's observations
        base_filter = [
            Plot.trial_id == trial_id,
            Observation.trait_id == trait.id,
        ]
        if round_id is not None:
            base_filter.append(Observation.scoring_round_id == round_id)

        count = (
            db.query(func.count(Observation.id))
            .join(Plot, Observation.plot_id == Plot.id)
            .filter(*base_filter)
            .scalar()
        ) or 0

        stat: dict = {
            "trait_id": trait.id,
            "trait_name": trait.name,
            "trait_label": trait.label,
            "data_type": trait.data_type,
            "unit": trait.unit,
            "count": count,
            "total_plots": total_plots,
        }

        if count == 0:
            trait_stats.append(stat)
            continue

        if trait.data_type in ("integer", "float"):
            # Compute all numeric aggregates in SQL — no values pulled into Python.
            # Stddev uses the algebraic identity: Var(X) = E[X²] − E[X]²
            val_f = cast(Observation.value, SAFloat)
            agg = (
                db.query(
                    func.avg(val_f).label("mean"),
                    func.min(val_f).label("min_val"),
                    func.max(val_f).label("max_val"),
                    func.avg(val_f * val_f).label("mean_sq"),
                )
                .join(Plot, Observation.plot_id == Plot.id)
                .filter(*base_filter)
            ).one()

            if agg.mean is not None:
                mean = float(agg.mean)
                variance = float(agg.mean_sq) - mean * mean
                sd = math.sqrt(max(variance, 0.0))  # clamp floating-point rounding errors
                stat.update({
                    "mean": round(mean, 3),
                    "sd": round(sd, 3),
                    "min_value": float(agg.min_val),
                    "max_value": float(agg.max_val),
                })

        elif trait.data_type == "categorical":
            cats = json.loads(trait.categories) if trait.categories else []
            labels = json.loads(trait.category_labels) if trait.category_labels else []
            label_map = dict(zip(cats, labels)) if labels else {}

            # GROUP BY in SQL replaces Counter() over a full result set in Python
            counts_rows = (
                db.query(Observation.value, func.count(Observation.id))
                .join(Plot, Observation.plot_id == Plot.id)
                .filter(*base_filter)
                .group_by(Observation.value)
                .all()
            )
            counts = {val: cnt for val, cnt in counts_rows}
            stat["distribution"] = [
                {"value": c, "label": label_map.get(c), "count": counts.get(c, 0)}
                for c in (cats if cats else sorted(counts.keys()))
            ]

        elif trait.data_type == "date":
            # MIN/MAX on ISO date strings work correctly with lexicographic comparison
            dates = (
                db.query(
                    func.min(Observation.value).label("earliest"),
                    func.max(Observation.value).label("latest"),
                )
                .join(Plot, Observation.plot_id == Plot.id)
                .filter(*base_filter)
            ).one()
            if dates.earliest:
                stat["earliest"] = dates.earliest
                stat["latest"] = dates.latest

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

    # --- Batch-fetch all observations for this trial in a single query ---
    plot_ids = [p.id for p in plots]
    obs_query = (
        db.query(Observation)
        .filter(Observation.plot_id.in_(plot_ids))
    )
    if round_id is not None:
        obs_query = obs_query.filter(Observation.scoring_round_id == round_id)

    # Group into {plot_id: {trait_name: Observation}} and {plot_id: latest_obs}
    obs_by_plot: dict[int, dict[str, Observation]] = {}
    latest_by_plot: dict[int, Observation] = {}
    for obs in obs_query.all():
        obs_by_plot.setdefault(obs.plot_id, {})[obs.trait_name] = obs
        cur_latest = latest_by_plot.get(obs.plot_id)
        if cur_latest is None or obs.recorded_at > cur_latest.recorded_at:
            latest_by_plot[obs.plot_id] = obs

    # Fetch scoring round name once (not once per plot)
    round_name = ""
    if round_id is not None:
        round_obj = get_scoring_round(db, round_id)
        round_name = round_obj.name if round_obj else ""
    # --- end batch fetch ---

    output = io.StringIO()
    writer = csv.writer(output)

    # header: fixed cols + round_col + trait cols + meta cols
    header = ["plot_id", "genotype", "rep", "row", "column", "plot_status"]
    if round_id is not None:
        header.append("scoring_round")
    header += trait_names + ["latitude", "longitude", "temperature", "humidity", "notes", "recorded_at"]
    writer.writerow(header)

    for plot in plots:
        obs_by_trait = obs_by_plot.get(plot.id, {})
        latest_obs = latest_by_plot.get(plot.id)

        row_data = [
            plot.plot_id, plot.genotype, plot.rep, plot.row, plot.column, plot.plot_status,
        ]
        if round_id is not None:
            row_data.append(round_name)

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
