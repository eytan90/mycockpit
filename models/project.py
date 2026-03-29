from pydantic import BaseModel
from typing import Optional, List


class Milestone(BaseModel):
    index: int
    title: str
    done: bool
    owner: Optional[str] = None
    start: Optional[str] = None
    due: Optional[str] = None
    status: Optional[str] = None


class Project(BaseModel):
    id: str
    name: str
    status: str
    progress: int
    owner: Optional[str] = None
    team: List[str] = []
    start_date: Optional[str] = None
    target_date: Optional[str] = None
    priority: str = "medium"
    category: Optional[str] = None
    description: Optional[str] = None
    goals: List[str] = []
    risks: Optional[str] = None
    next_action: Optional[str] = None
    blockers: Optional[str] = None
    confidence: Optional[str] = None
    milestones: List[Milestone] = []
    # computed
    milestones_total: int = 0
    milestones_done: int = 0
    milestones_wip: int = 0
    calculated_progress: Optional[int] = None
