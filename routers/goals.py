from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from config import get_vault_path
from models.goal import Goal
from parsers.goals_parser import parse_goals, add_goal

router = APIRouter(prefix="/api/goals", tags=["goals"])


def _goals_path():
    return get_vault_path() / "00_Dashboard" / "goals.md"


@router.get("", response_model=List[Goal])
def list_goals():
    return parse_goals(_goals_path())


class NewGoal(BaseModel):
    id: str
    title: str
    horizon: Optional[str] = None
    status: str = "active"
    linked_projects: List[str] = []


@router.post("")
def create_goal(body: NewGoal):
    goals = parse_goals(_goals_path())
    if any(g.id == body.id for g in goals):
        raise HTTPException(400, f"Goal '{body.id}' already exists")
    goal = Goal(**body.model_dump())
    add_goal(_goals_path(), goal)
    return {"ok": True, "id": goal.id}
