from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import crud
from auth import get_current_user
from database import get_db
from models import User
from schemas import WALK_MODES, TrialCloneRequest, TrialCreate, TrialResponse, TrialUpdate

router = APIRouter(prefix="/trials", tags=["trials"])


def _enrich_trial_response(db: Session, trial) -> TrialResponse:
    plot_count, scored_count = crud.get_trial_plot_counts(db, trial.id)
    resp = TrialResponse.model_validate(trial)
    resp.plot_count = plot_count
    resp.scored_count = scored_count
    resp.team_id = trial.team_id
    if trial.team:
        resp.team_name = trial.team.name
    return resp


@router.get("", response_model=list[TrialResponse])
def list_trials(
    team_id: int | None = Query(None, description="Filter by team ID"),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    trials = crud.get_trials(
        db,
        user_id=current_user.id if current_user and team_id is None else None,
        team_id=team_id,
    )
    # Batch-fetch plot/scored counts for all trials in 2 queries (was 2 per trial)
    counts = crud.get_trial_plot_counts_bulk(db, [t.id for t in trials])
    results = []
    for t in trials:
        resp = TrialResponse.model_validate(t)
        resp.plot_count, resp.scored_count = counts.get(t.id, (0, 0))
        resp.team_id = t.team_id
        if t.team:
            resp.team_name = t.team.name
        results.append(resp)
    return results


@router.post("", response_model=TrialResponse, status_code=201)
def create_trial(
    data: TrialCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    trial = crud.create_trial(
        db,
        name=data.name,
        crop=data.crop,
        location=data.location,
        start_date=data.start_date,
        end_date=data.end_date,
        walk_mode=data.walk_mode,
        user_id=current_user.id if current_user else None,
        team_id=data.team_id,
        trait_ids=data.trait_ids,
        first_round_name=data.first_round_name,
    )
    return _enrich_trial_response(db, trial)


@router.get("/{trial_id}", response_model=TrialResponse)
def get_trial(trial_id: int, db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    return _enrich_trial_response(db, trial)


@router.patch("/{trial_id}", response_model=TrialResponse)
def update_trial(trial_id: int, data: TrialUpdate, db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    if data.walk_mode is not None:
        if data.walk_mode not in WALK_MODES:
            raise HTTPException(status_code=422, detail=f"walk_mode must be one of {WALK_MODES}")
        trial.walk_mode = data.walk_mode
    db.commit()
    db.refresh(trial)
    return _enrich_trial_response(db, trial)


@router.delete("/{trial_id}")
def delete_trial(trial_id: int, db: Session = Depends(get_db)):
    if not crud.delete_trial(db, trial_id):
        raise HTTPException(status_code=404, detail="Trial not found")
    return {"success": True}


@router.post("/{trial_id}/clone", response_model=TrialResponse, status_code=201)
def clone_trial(
    trial_id: int,
    data: TrialCloneRequest,
    db: Session = Depends(get_db),
):
    cloned = crud.clone_trial(
        db,
        source_trial_id=trial_id,
        name=data.name,
        location=data.location,
        start_date=data.start_date,
        end_date=data.end_date,
        first_round_name=data.first_round_name,
    )
    if not cloned:
        raise HTTPException(status_code=404, detail="Source trial not found")
    return _enrich_trial_response(db, cloned)
