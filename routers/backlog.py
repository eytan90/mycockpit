import json
import urllib.request
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from config import get_vault_path, load_config
from models.task import Task
from parsers.backlog_parser import parse_backlog, parse_backlog_sections, append_task, patch_task

router = APIRouter(prefix="/api/backlog", tags=["backlog"])


def _backlog_path():
    return get_vault_path() / "master_backlog.md"


@router.get("", response_model=List[Task])
def list_backlog():
    return parse_backlog(_backlog_path())


@router.get("/sections")
def backlog_sections():
    return parse_backlog_sections(_backlog_path())


class NewTask(BaseModel):
    text: str
    area: Optional[str] = ""
    from_: Optional[str] = "Eytan"


def _push_to_planner(title: str, area: str, from_: str) -> None:
    """Optionally mirror a new backlog task to Planner via Power Automate webhook (Flow 4)."""
    config = load_config()
    webhook_url = config.get("planner_create_webhook", "").strip()
    if not webhook_url:
        return
    payload = {"title": title, "bucket": area or "Backlog", "assigned_to": from_}
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        webhook_url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass  # Don't fail local save if Planner webhook is unreachable


@router.post("")
def add_task(body: NewTask):
    append_task(_backlog_path(), body.text, body.area or "", body.from_ or "Eytan")
    _push_to_planner(body.text, body.area or "", body.from_ or "Eytan")
    return {"ok": True}


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    area: Optional[str] = None


@router.patch("/{task_id}")
def update_task(task_id: str, body: TaskUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No updates provided")
    ok = patch_task(_backlog_path(), task_id, updates)
    if not ok:
        raise HTTPException(404, f"Task '{task_id}' not found")
    return {"ok": True}
