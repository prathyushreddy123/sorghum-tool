from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

import crud
from database import get_db
from schemas import HeatmapResponse, TrialStatsResponse

router = APIRouter(tags=["stats"])


@router.get("/trials/{trial_id}/stats", response_model=TrialStatsResponse)
def get_trial_stats(trial_id: int, db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    return crud.get_trial_stats(db, trial_id)


@router.get("/trials/{trial_id}/heatmap", response_model=HeatmapResponse)
def get_trial_heatmap(trial_id: int, db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    return crud.get_trial_heatmap(db, trial_id)


@router.get("/trials/{trial_id}/export")
def export_trial_csv(trial_id: int, db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    csv_content = crud.export_trial_csv(db, trial_id)
    filename = f"{trial.name.replace(' ', '_')}_{trial.start_date.isoformat()}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
