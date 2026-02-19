from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import crud
from database import get_db
from schemas import (
    ObservationBulkCreate,
    ObservationCreate,
    ObservationResponse,
    ObservationUpdate,
)

router = APIRouter(tags=["observations"])


@router.get("/plots/{plot_id}/observations", response_model=list[ObservationResponse])
def list_observations(
    plot_id: int,
    round_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    plot = crud.get_plot(db, plot_id)
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    return crud.get_observations(db, plot_id, round_id=round_id)


@router.get(
    "/trials/{trial_id}/observations",
    response_model=list[ObservationResponse],
)
def list_trial_observations(
    trial_id: int,
    round_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    """Fetch all observations for a trial in one request (used by offline prefetch)."""
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    return crud.get_trial_observations(db, trial_id, round_id=round_id)


@router.post("/observations", response_model=ObservationResponse, status_code=201)
def create_observation(data: ObservationCreate, db: Session = Depends(get_db)):
    plot = crud.get_plot(db, data.plot_id)
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")

    # Resolve trait
    trait = None
    trait_name = data.trait_name or ""
    if data.trait_id:
        trait = crud.get_trait(db, data.trait_id)
        if not trait:
            raise HTTPException(status_code=404, detail="Trait not found")
        trait_name = trait.name

    if not trait_name:
        raise HTTPException(status_code=422, detail="Either trait_id or trait_name is required")

    error = crud.validate_observation_value(trait, trait_name, data.value)
    if error:
        raise HTTPException(status_code=422, detail=error)

    obs = crud.create_observation(
        db,
        plot_id=data.plot_id,
        trait_name=trait_name,
        value=data.value,
        trait_id=data.trait_id,
        scoring_round_id=data.scoring_round_id,
        notes=data.notes,
        latitude=data.latitude,
        longitude=data.longitude,
        temperature=data.temperature,
        humidity=data.humidity,
    )
    return ObservationResponse.model_validate(obs)


@router.put("/observations/{observation_id}", response_model=ObservationResponse)
def update_observation(observation_id: int, data: ObservationUpdate, db: Session = Depends(get_db)):
    existing = crud.update_observation(db, observation_id)  # fetch to check existence
    if not existing:
        raise HTTPException(status_code=404, detail="Observation not found")

    if data.value is not None:
        trait = crud.get_trait(db, existing.trait_id) if existing.trait_id else None
        error = crud.validate_observation_value(trait, existing.trait_name, data.value)
        if error:
            raise HTTPException(status_code=422, detail=error)

    obs = crud.update_observation(db, observation_id, value=data.value, notes=data.notes)
    return ObservationResponse.model_validate(obs)


@router.post("/plots/{plot_id}/observations/bulk", response_model=list[ObservationResponse])
def bulk_create_observations(
    plot_id: int, data: ObservationBulkCreate, db: Session = Depends(get_db)
):
    plot = crud.get_plot(db, plot_id)
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")

    # Validate each item
    for item in data.observations:
        trait = crud.get_trait(db, item.trait_id) if item.trait_id else None
        trait_name = (trait.name if trait else None) or item.trait_name or ""
        if not trait_name:
            raise HTTPException(status_code=422, detail="Each observation needs trait_id or trait_name")
        error = crud.validate_observation_value(trait, trait_name, item.value)
        if error:
            raise HTTPException(status_code=422, detail=error)

    items = [item.model_dump() for item in data.observations]
    results = crud.bulk_create_observations(db, plot_id, items, scoring_round_id=data.scoring_round_id)
    return [ObservationResponse.model_validate(r) for r in results]
