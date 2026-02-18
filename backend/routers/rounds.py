from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
from database import get_db
from schemas import ScoringRoundCreate, ScoringRoundResponse, ScoringRoundUpdate

router = APIRouter(tags=["rounds"])


@router.get("/trials/{trial_id}/rounds", response_model=list[ScoringRoundResponse])
def list_rounds(trial_id: int, db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    rounds = crud.get_scoring_rounds(db, trial_id)
    total = db.query(crud.Plot).filter(crud.Plot.trial_id == trial_id).count()
    results = []
    for r in rounds:
        scored, _ = crud.get_round_completion(db, r.id, trial_id)
        resp = ScoringRoundResponse.model_validate(r)
        resp.scored_plots = scored
        resp.total_plots = total
        results.append(resp)
    return results


@router.post("/trials/{trial_id}/rounds", response_model=ScoringRoundResponse, status_code=201)
def create_round(trial_id: int, data: ScoringRoundCreate, db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    sr = crud.create_scoring_round(db, trial_id, data.name, scored_at=data.scored_at, notes=data.notes)
    resp = ScoringRoundResponse.model_validate(sr)
    resp.total_plots = db.query(crud.Plot).filter(crud.Plot.trial_id == trial_id).count()
    return resp


@router.get("/trials/{trial_id}/rounds/{round_id}", response_model=ScoringRoundResponse)
def get_round(trial_id: int, round_id: int, db: Session = Depends(get_db)):
    sr = crud.get_scoring_round(db, round_id)
    if not sr or sr.trial_id != trial_id:
        raise HTTPException(status_code=404, detail="Scoring round not found")
    scored, total = crud.get_round_completion(db, round_id, trial_id)
    resp = ScoringRoundResponse.model_validate(sr)
    resp.scored_plots = scored
    resp.total_plots = total
    return resp


@router.put("/trials/{trial_id}/rounds/{round_id}", response_model=ScoringRoundResponse)
def update_round(trial_id: int, round_id: int, data: ScoringRoundUpdate, db: Session = Depends(get_db)):
    sr = crud.get_scoring_round(db, round_id)
    if not sr or sr.trial_id != trial_id:
        raise HTTPException(status_code=404, detail="Scoring round not found")
    updated = crud.update_scoring_round(db, round_id, **data.model_dump(exclude_none=True))
    resp = ScoringRoundResponse.model_validate(updated)
    scored, total = crud.get_round_completion(db, round_id, trial_id)
    resp.scored_plots = scored
    resp.total_plots = total
    return resp


@router.delete("/trials/{trial_id}/rounds/{round_id}")
def delete_round(trial_id: int, round_id: int, db: Session = Depends(get_db)):
    sr = crud.get_scoring_round(db, round_id)
    if not sr or sr.trial_id != trial_id:
        raise HTTPException(status_code=404, detail="Scoring round not found")
    crud.delete_scoring_round(db, round_id)
    return {"success": True}
