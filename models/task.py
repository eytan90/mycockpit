from pydantic import BaseModel
from typing import Optional


class Task(BaseModel):
    id: str
    title: str
    status: str
    notes: Optional[str] = None
    area: Optional[str] = None
    from_: Optional[str] = None
    added: Optional[str] = None
    project_ref: Optional[str] = None
    section: str = "Uncategorized"
    source: str = "table"  # "table" or "list"
