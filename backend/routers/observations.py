from fastapi import APIRouter, Depends, HTTPException
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
def list_observations(plot_id: int, db: Session = Depends(get_db)):
    plot = crud.get_plot(db, plot_id)
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    return crud.get_observations(db, plot_id)


@router.post("/observations", response_model=ObservationResponse, status_code=201)
def create_observation(data: ObservationCreate, db: Session = Depends(get_db)):
    plot = crud.get_plot(db, data.plot_id)
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    error = crud.validate_observation_value(data.trait_name, data.value)
    if error:
        raise HTTPException(status_code=422, detail=error)
    obs = crud.create_observation(
        db, data.plot_id, data.trait_name, data.value, data.notes,
        data.latitude, data.longitude, data.temperature, data.humidity,
    )
    return ObservationResponse.model_validate(obs)


@router.put("/observations/{observation_id}", response_model=ObservationResponse)
def update_observation(observation_id: int, data: ObservationUpdate, db: Session = Depends(get_db)):
    if data.value is not None:
        # We need the trait_name to validate — fetch existing first
        existing = crud.update_observation(db, observation_id)  # just to check existence
        if not existing:
            raise HTTPException(status_code=404, detail="Observation not found")
        error = crud.validate_observation_value(existing.trait_name, data.value)
        if error:
            raise HTTPException(status_code=422, detail=error)
    obs = crud.update_observation(db, observation_id, value=data.value, notes=data.notes)
    if not obs:
        raise HTTPException(status_code=404, detail="Observation not found")
    return ObservationResponse.model_validate(obs)


@router.post("/plots/{plot_id}/observations/bulk", response_model=list[ObservationResponse])
def bulk_create_observations(
    plot_id: int, data: ObservationBulkCreate, db: Session = Depends(get_db)
):
    plot = crud.get_plot(db, plot_id)
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    for item in data.observations:
        error = crud.validate_observation_value(item.trait_name, item.value)
        if error:
            raise HTTPException(status_code=422, detail=f"{item.trait_name}: {error}")
    items = [item.model_dump() for item in data.observations]
    results = crud.bulk_create_observations(db, plot_id, items)
    return [ObservationResponse.model_validate(r) for r in results]
