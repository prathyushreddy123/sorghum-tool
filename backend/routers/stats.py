from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

import crud
from auth import get_authorized_trial
from database import get_db
from models import Trial
from schemas import HeatmapResponse, TrialStatsResponse

router = APIRouter(tags=["stats"])


@router.get("/trials/{trial_id}/stats", response_model=TrialStatsResponse)
def get_trial_stats(
    trial_id: int,
    round_id: int | None = Query(None),
    db: Session = Depends(get_db),
    trial: Trial = Depends(get_authorized_trial),
):
    return crud.get_trial_stats(db, trial.id, round_id=round_id)


@router.get("/trials/{trial_id}/heatmap", response_model=HeatmapResponse)
def get_trial_heatmap(
    trial_id: int,
    trait_id: int | None = Query(None),
    round_id: int | None = Query(None),
    db: Session = Depends(get_db),
    trial: Trial = Depends(get_authorized_trial),
):
    return crud.get_trial_heatmap(db, trial.id, trait_id=trait_id, round_id=round_id)


@router.get("/trials/{trial_id}/export")
def export_trial_csv(
    trial_id: int,
    round_id: int | None = Query(None),
    db: Session = Depends(get_db),
    trial: Trial = Depends(get_authorized_trial),
):
    csv_content = crud.export_trial_csv(db, trial.id, round_id=round_id)
    filename = f"{trial.name.replace(' ', '_')}_{trial.start_date.isoformat()}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
