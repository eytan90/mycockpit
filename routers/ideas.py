from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from config import get_vault_path
from models.idea import Idea
from parsers.ideas_parser import (
    parse_ideas, update_idea, promote_to_backlog, graduate_idea
)

router = APIRouter(prefix="/api/ideas", tags=["ideas"])


def _ideas_path():
    return get_vault_path() / "00_Dashboard" / "ideas.md"

def _backlog_path():
    return get_vault_path() / "master_backlog.md"


@router.get("", response_model=List[Idea])
def list_ideas():
    return parse_ideas(_ideas_path())


class IdeaUpdate(BaseModel):
    area: Optional[str] = None
    effort: Optional[str] = None
    from_: Optional[str] = None
    stage: Optional[str] = None
    title: Optional[str] = None


@router.patch("/{idea_index}")
def update_idea_endpoint(idea_index: int, body: IdeaUpdate):
    path = _ideas_path()
    updates = {}
    if body.area is not None:
        updates["area"] = body.area
    if body.effort is not None:
        updates["effort"] = body.effort
    if body.from_ is not None:
        updates["from"] = body.from_
    if body.stage is not None:
        updates["stage"] = body.stage
    if body.title is not None:
        updates["title"] = body.title

    if not updates:
        raise HTTPException(400, "No updates provided")

    update_idea(path, idea_index, updates)
    return {"ok": True, "updated": list(updates.keys())}


@router.post("/{idea_index}/promote")
def promote_idea(idea_index: int):
    path = _ideas_path()
    ideas = parse_ideas(path)
    matching = [i for i in ideas if i.index == idea_index]
    if not matching:
        raise HTTPException(404, f"Idea {idea_index} not found")

    idea = matching[0]
    if idea.maturity < 90:
        raise HTTPException(400, f"Idea not ready to promote (maturity: {idea.maturity})")

    promote_to_backlog(idea, _backlog_path())
    graduate_idea(idea.raw_line, path)
    return {"ok": True, "title": idea.title}
