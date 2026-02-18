from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import crud
from database import get_db
from schemas import (
    TraitCreate,
    TraitResponse,
    TrialTraitAdd,
    TrialTraitBulkAdd,
    TrialTraitReorder,
    TrialTraitResponse,
)

router = APIRouter(tags=["traits"])


# ─── Global Trait Library ──────────────────────────────────────────────────────

@router.get("/traits", response_model=list[TraitResponse])
def list_traits(crop_hint: str | None = Query(None), db: Session = Depends(get_db)):
    return crud.get_traits(db, crop_hint=crop_hint)


@router.post("/traits", response_model=TraitResponse, status_code=201)
def create_trait(data: TraitCreate, db: Session = Depends(get_db)):
    existing = crud.get_trait_by_name(db, data.name)
    if existing:
        raise HTTPException(status_code=409, detail=f"Trait '{data.name}' already exists")
    return crud.create_trait(db, **data.model_dump())


@router.get("/traits/{trait_id}", response_model=TraitResponse)
def get_trait(trait_id: int, db: Session = Depends(get_db)):
    trait = crud.get_trait(db, trait_id)
    if not trait:
        raise HTTPException(status_code=404, detail="Trait not found")
    return trait


@router.put("/traits/{trait_id}", response_model=TraitResponse)
def update_trait(trait_id: int, data: TraitCreate, db: Session = Depends(get_db)):
    trait = crud.update_trait(db, trait_id, **data.model_dump())
    if not trait:
        raise HTTPException(status_code=404, detail="Trait not found or is a system trait")
    return trait


@router.delete("/traits/{trait_id}")
def delete_trait(trait_id: int, db: Session = Depends(get_db)):
    if not crud.delete_trait(db, trait_id):
        raise HTTPException(status_code=404, detail="Trait not found or is a system trait")
    return {"success": True}


# ─── Trial Trait Management ────────────────────────────────────────────────────

@router.get("/trials/{trial_id}/traits", response_model=list[TrialTraitResponse])
def list_trial_traits(trial_id: int, db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    return crud.get_trial_traits(db, trial_id)


@router.post("/trials/{trial_id}/traits", response_model=TrialTraitResponse, status_code=201)
def add_trait_to_trial(trial_id: int, data: TrialTraitAdd, db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    trait = crud.get_trait(db, data.trait_id)
    if not trait:
        raise HTTPException(status_code=404, detail="Trait not found")
    tt = crud.add_trait_to_trial(db, trial_id, data.trait_id, data.display_order)
    return tt


@router.post("/trials/{trial_id}/traits/bulk", response_model=list[TrialTraitResponse], status_code=201)
def bulk_add_traits_to_trial(trial_id: int, data: TrialTraitBulkAdd, db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    return crud.bulk_add_traits_to_trial(db, trial_id, data.trait_ids)


@router.delete("/trials/{trial_id}/traits/{trait_id}")
def remove_trait_from_trial(trial_id: int, trait_id: int, db: Session = Depends(get_db)):
    if not crud.remove_trait_from_trial(db, trial_id, trait_id):
        raise HTTPException(status_code=404, detail="Trait not assigned to this trial")
    return {"success": True}


@router.put("/trials/{trial_id}/traits/reorder", response_model=list[TrialTraitResponse])
def reorder_trial_traits(trial_id: int, data: TrialTraitReorder, db: Session = Depends(get_db)):
    trial = crud.get_trial(db, trial_id)
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    return crud.reorder_trial_traits(db, trial_id, data.ordered_trait_ids)
