from pydantic import BaseModel
from typing import Optional


class Idea(BaseModel):
    index: int
    title: str
    raw_line: str
    section: str
    area: Optional[str] = None
    effort: Optional[str] = None
    from_: Optional[str] = None
    stage: Optional[str] = None
    added: Optional[str] = None
    done: bool = False
    graduated: bool = False
    maturity: int = 10
    mat_label: str = "Needs refinement"
    mat_color: str = "#F5A623"
