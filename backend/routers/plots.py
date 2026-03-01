from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session

import crud
from auth import get_authorized_trial, get_authorized_plot
from database import get_db
from models import Trial, Plot
from schemas import (
    NextUnscoredResponse,
    PlotAttributeResponse,
    PlotAttributeSet,
    PlotCreate,
    PlotImportResponse,
    PlotResponse,
    PlotStatusUpdate,
)

router = APIRouter(tags=["plots"])


@router.get("/trials/{trial_id}/plots", response_model=list[PlotResponse])
def list_plots(
    trial_id: int,
    search: str | None = Query(None),
    scored: bool | None = Query(None),
    round_id: int | None = Query(None),
    status: str | None = Query(None),
    walk_mode: str | None = Query(None),
    db: Session = Depends(get_db),
    trial: Trial = Depends(get_authorized_trial),
):
    effective_walk = walk_mode or trial.walk_mode or "row_by_row"
    plots = crud.get_plots(
        db, trial.id, search=search, scored=scored,
        round_id=round_id, status=status, walk_mode=effective_walk,
    )
    plot_ids = [p.id for p in plots]
    observed_set = crud.get_plots_observed_set(db, plot_ids, round_id=round_id)
    results = []
    for p in plots:
        resp = PlotResponse.model_validate(p)
        resp.has_observations = p.id in observed_set
        results.append(resp)
    return results


@router.post("/trials/{trial_id}/plots", response_model=PlotResponse, status_code=201)
def create_plot(
    trial_id: int,
    data: PlotCreate,
    db: Session = Depends(get_db),
    trial: Trial = Depends(get_authorized_trial),
):
    plot = crud.create_plot(
        db,
        trial_id=trial.id,
        plot_id=data.plot_id,
        genotype=data.genotype,
        rep=data.rep,
        row=data.row,
        column=data.column,
        notes=data.notes,
    )
    return PlotResponse.model_validate(plot)


@router.post("/trials/{trial_id}/plots/import", response_model=PlotImportResponse)
def import_plots(
    trial_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    trial: Trial = Depends(get_authorized_trial),
):
    content = file.file.read().decode("utf-8")
    imported, errors = crud.import_plots_csv(db, trial.id, content)
    return PlotImportResponse(imported=imported, errors=errors)


@router.delete("/trials/{trial_id}/plots/{plot_id}")
def delete_plot(
    trial_id: int,
    plot_id: int,
    db: Session = Depends(get_db),
    trial: Trial = Depends(get_authorized_trial),
):
    plot = crud.get_plot(db, plot_id)
    if not plot or plot.trial_id != trial.id:
        raise HTTPException(status_code=404, detail="Plot not found")
    crud.delete_plot(db, plot_id)
    return {"success": True}


@router.put("/trials/{trial_id}/plots/{plot_id}/status", response_model=PlotResponse)
def update_plot_status(
    trial_id: int,
    plot_id: int,
    data: PlotStatusUpdate,
    db: Session = Depends(get_db),
    trial: Trial = Depends(get_authorized_trial),
):
    plot = crud.get_plot(db, plot_id)
    if not plot or plot.trial_id != trial.id:
        raise HTTPException(status_code=404, detail="Plot not found")
    updated = crud.update_plot_status(db, plot_id, data.plot_status)
    return PlotResponse.model_validate(updated)


@router.get(
    "/trials/{trial_id}/plots/{plot_id}/next-unscored",
    response_model=NextUnscoredResponse,
)
def next_unscored(
    trial_id: int,
    plot_id: int,
    round_id: int | None = Query(None),
    db: Session = Depends(get_db),
    trial: Trial = Depends(get_authorized_trial),
):
    next_id = crud.get_next_unscored_plot(
        db, trial.id, plot_id, round_id=round_id, walk_mode=trial.walk_mode or "row_by_row",
    )
    return NextUnscoredResponse(next_plot_id=next_id)


# ─── Plot Attributes ──────────────────────────────────────────────────────────

@router.get("/plots/{plot_id}/attributes", response_model=list[PlotAttributeResponse])
def get_plot_attributes(
    plot_id: int,
    db: Session = Depends(get_db),
    plot: Plot = Depends(get_authorized_plot),
):
    return crud.get_plot_attributes(db, plot.id)


@router.post("/plots/{plot_id}/attributes", response_model=PlotAttributeResponse, status_code=201)
def set_plot_attribute(
    plot_id: int,
    data: PlotAttributeSet,
    db: Session = Depends(get_db),
    plot: Plot = Depends(get_authorized_plot),
):
    return crud.set_plot_attribute(db, plot.id, data.key, data.value)


@router.delete("/plots/{plot_id}/attributes/{key}")
def delete_plot_attribute(
    plot_id: int,
    key: str,
    db: Session = Depends(get_db),
    plot: Plot = Depends(get_authorized_plot),
):
    if not crud.delete_plot_attribute(db, plot.id, key):
        raise HTTPException(status_code=404, detail="Attribute not found")
    return {"success": True}
