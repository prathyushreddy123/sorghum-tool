from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
from auth import require_user
from database import get_db
from models import User
from schemas import TeamCreate, TeamJoin, TeamMemberResponse, TeamResponse

router = APIRouter(prefix="/teams", tags=["teams"])


def _build_team_response(db: Session, team) -> TeamResponse:
    members = crud.get_team_members(db, team.id)
    member_responses = [
        TeamMemberResponse(
            id=m.id,
            user_id=m.user_id,
            user_name=m.user.name,
            user_email=m.user.email,
            joined_at=m.joined_at,
        )
        for m in members
    ]
    return TeamResponse(
        id=team.id,
        name=team.name,
        invite_code=team.invite_code,
        created_by=team.created_by,
        created_at=team.created_at,
        member_count=len(members),
        members=member_responses,
    )


@router.get("", response_model=list[TeamResponse])
def list_teams(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    teams = crud.get_user_teams(db, current_user.id)
    return [_build_team_response(db, t) for t in teams]


@router.post("", response_model=TeamResponse, status_code=201)
def create_team(
    data: TeamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    team = crud.create_team(db, name=data.name, creator_id=current_user.id)
    return _build_team_response(db, team)


@router.get("/{team_id}", response_model=TeamResponse)
def get_team(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    team = crud.get_team(db, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if not crud.is_team_member(db, team_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this team")
    return _build_team_response(db, team)


@router.post("/join", response_model=TeamResponse)
def join_team(
    data: TeamJoin,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    team = crud.get_team_by_invite_code(db, data.invite_code)
    if not team:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    crud.join_team(db, team.id, current_user.id)
    return _build_team_response(db, team)


@router.post("/{team_id}/leave")
def leave_team(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if not crud.leave_team(db, team_id, current_user.id):
        raise HTTPException(status_code=404, detail="Not a member")
    return {"success": True}


@router.delete("/{team_id}/members/{user_id}")
def remove_member(
    team_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if not crud.is_team_member(db, team_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this team")
    if not crud.remove_team_member(db, team_id, user_id):
        raise HTTPException(status_code=404, detail="Member not found")
    return {"success": True}


@router.delete("/{team_id}")
def delete_team(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    team = crud.get_team(db, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if team.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the team creator can delete this team")
    if not crud.delete_team(db, team_id):
        raise HTTPException(status_code=404, detail="Team not found")
    return {"success": True}


@router.post("/{team_id}/regenerate-code", response_model=TeamResponse)
def regenerate_invite_code(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if not crud.is_team_member(db, team_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this team")
    team = crud.regenerate_invite_code(db, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return _build_team_response(db, team)
