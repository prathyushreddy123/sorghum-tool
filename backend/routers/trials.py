from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
from database import get_db
from schemas import TrialCreate, TrialResponse

router = APIRouter(prefix="/trials", tags=["trials"])


@router.get("", response_model=list[TrialResponse])
def list_trials(db: Session = Depends(get_db)):
    trials = crud.get_trials(db)
    results = []
    for t in trials:
        plot_count, scored_count = crud.get_trial_plot_counts(db, t.id)
        resp = TrialResponse.model_validate(t)
        resp.plot_count = plot_count
        resp.scored_count = scored_count
        results.append(resp)
    return results


@router.post("", response_model=TrialResponse, status_code=201)
def create_trial(data: TrialCreate, db: Session = Depends(get_db)):
    trial = crud.create_trial(
        db,
        name=data.name,
        crop=data.crop,
        location=data.location,
        start_date=data.start_date,
        end_date=data.end_date,
    )
    return TrialResponse.model_validate(trial)


@router.get("/{trial_id}", response_model=TrialResponse)
def get_trial(trial_id: int, db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    plot_count, scored_count = crud.get_trial_plot_counts(db, trial.id)
    resp = TrialResponse.model_validate(trial)
    resp.plot_count = plot_count
    resp.scored_count = scored_count
    return resp


@router.delete("/{trial_id}")
def delete_trial(trial_id: int, db: Session = Depends(get_db)):
    if not crud.delete_trial(db, trial_id):
        raise HTTPException(status_code=404, detail="Trial not found")
    return {"success": True}
