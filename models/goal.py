from pydantic import BaseModel
from typing import Optional, List


class Goal(BaseModel):
    id: str
    title: str
    horizon: Optional[str] = None
    status: str = "active"
    linked_projects: List[str] = []
