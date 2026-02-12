from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

import crud
from database import get_db
from schemas import (
    NextUnscoredResponse,
    PlotCreate,
    PlotImportResponse,
    PlotResponse,
)

router = APIRouter(tags=["plots"])


@router.get("/trials/{trial_id}/plots", response_model=list[PlotResponse])
def list_plots(
    trial_id: int,
    search: str | None = Query(None),
    scored: bool | None = Query(None),
    db: Session = Depends(get_db),
):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    plots = crud.get_plots(db, trial_id, search=search, scored=scored)
    results = []
    for p in plots:
        resp = PlotResponse.model_validate(p)
        resp.has_observations = crud.plot_has_observations(db, p.id)
        results.append(resp)
    return results


@router.post("/trials/{trial_id}/plots", response_model=PlotResponse, status_code=201)
def create_plot(trial_id: int, data: PlotCreate, db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    plot = crud.create_plot(
        db,
        trial_id=trial_id,
        plot_id=data.plot_id,
        genotype=data.genotype,
        rep=data.rep,
        row=data.row,
        column=data.column,
        notes=data.notes,
    )
    return PlotResponse.model_validate(plot)


@router.post("/trials/{trial_id}/plots/import", response_model=PlotImportResponse)
def import_plots(trial_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    content = file.file.read().decode("utf-8")
    imported, errors = crud.import_plots_csv(db, trial_id, content)
    return PlotImportResponse(imported=imported, errors=errors)


@router.delete("/trials/{trial_id}/plots/{plot_id}")
def delete_plot(trial_id: int, plot_id: int, db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    plot = crud.get_plot(db, plot_id)
    if not plot or plot.trial_id != trial_id:
        raise HTTPException(status_code=404, detail="Plot not found")
    crud.delete_plot(db, plot_id)
    return {"success": True}


@router.get(
    "/trials/{trial_id}/plots/{plot_id}/next-unscored",
    response_model=NextUnscoredResponse,
)
def next_unscored(trial_id: int, plot_id: int, db: Session = Depends(get_db)):
    next_id = crud.get_next_unscored_plot(db, trial_id, plot_id)
    return NextUnscoredResponse(next_plot_id=next_id)
