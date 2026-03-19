from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from pathlib import Path
import frontmatter as fm_lib

from config import get_vault_path
from models.project import Project, Milestone
from parsers.frontmatter import parse_fm, update_fm_field
from parsers.milestones import parse_milestones, toggle_milestone

router = APIRouter(prefix="/api/projects", tags=["projects"])

SKIP_FILES = {"project_registry.md"}
PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _projects_dir() -> Path:
    return get_vault_path() / "01_Projects"


def _build_project(path: Path) -> Project | None:
    fm, body = parse_fm(path)
    if not fm.get("name"):
        return None

    milestones = parse_milestones(body)
    total = len(milestones)
    done = sum(1 for m in milestones if m.done)
    wip = sum(1 for m in milestones if m.status and 'progress' in m.status)
    calc_progress = round(done / total * 100) if total > 0 else None

    # team can be a list or a scalar
    team_raw = fm.get("team", [])
    team = team_raw if isinstance(team_raw, list) else [str(team_raw)] if team_raw else []

    goals_raw = fm.get("goals", [])
    goals = goals_raw if isinstance(goals_raw, list) else [str(goals_raw)] if goals_raw else []

    return Project(
        id=path.stem,
        name=str(fm.get("name", path.stem)),
        status=str(fm.get("status", "unknown")),
        progress=int(fm.get("progress", 0)),
        owner=str(fm.get("owner", "")) or None,
        team=team,
        start_date=str(fm.get("start_date", "")) or None,
        target_date=str(fm.get("target_date", "")) or None,
        priority=str(fm.get("priority", "medium")),
        category=str(fm.get("category", "")) or None,
        description=str(fm.get("description", "")) or None,
        goals=goals,
        risks=str(fm.get("risks", "")) or None,
        next_action=str(fm.get("next_action", "")) or None,
        blockers=str(fm.get("blockers", "")) or None,
        confidence=str(fm.get("confidence", "")) or None,
        milestones=milestones,
        milestones_total=total,
        milestones_done=done,
        milestones_wip=wip,
        calculated_progress=calc_progress,
    )


@router.get("", response_model=List[Project])
def list_projects():
    d = _projects_dir()
    if not d.exists():
        return []
    projects = []
    for f in sorted(d.glob("*.md")):
        if f.name in SKIP_FILES:
            continue
        p = _build_project(f)
        if p:
            projects.append(p)
    projects.sort(key=lambda p: PRIORITY_ORDER.get(p.priority, 1))
    return projects


@router.get("/{project_id}", response_model=Project)
def get_project(project_id: str):
    path = _projects_dir() / f"{project_id}.md"
    if not path.exists():
        raise HTTPException(404, f"Project '{project_id}' not found")
    p = _build_project(path)
    if not p:
        raise HTTPException(404, f"Project '{project_id}' has no valid frontmatter")
    return p


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[int] = None
    owner: Optional[str] = None
    target_date: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    risks: Optional[str] = None
    next_action: Optional[str] = None
    blockers: Optional[str] = None
    confidence: Optional[str] = None


@router.patch("/{project_id}")
def update_project(project_id: str, body: ProjectUpdate):
    path = _projects_dir() / f"{project_id}.md"
    if not path.exists():
        raise HTTPException(404, f"Project '{project_id}' not found")

    updates = body.model_dump(exclude_none=True)
    for field, value in updates.items():
        update_fm_field(path, field, value)

    return {"ok": True, "updated": list(updates.keys())}


class MilestoneUpdate(BaseModel):
    done: bool


@router.patch("/{project_id}/milestones/{milestone_index}")
def update_milestone(project_id: str, milestone_index: int, body: MilestoneUpdate):
    path = _projects_dir() / f"{project_id}.md"
    if not path.exists():
        raise HTTPException(404, f"Project '{project_id}' not found")

    toggle_milestone(path, milestone_index, body.done)

    # Recalculate progress and update frontmatter
    fm, body_text = parse_fm(path)
    milestones = parse_milestones(body_text)
    total = len(milestones)
    if total > 0:
        done_count = sum(1 for m in milestones if m.done)
        new_progress = round(done_count / total * 100)
        update_fm_field(path, "progress", new_progress)

    return {"ok": True}
