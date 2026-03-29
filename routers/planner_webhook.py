"""
Planner webhook receiver + outbound task creation via Power Automate.

FLOW 2 — "Receive Planner task" (set up in Power Automate):
  Trigger:  When a task is created  -OR-  When a task is modified (Planner)
  Action:   HTTP POST → https://<ngrok-url>/api/webhook/planner
  Body:
  {
    "id":              "@{triggerOutputs()?['body/id']}",
    "title":           "@{triggerOutputs()?['body/title']}",
    "planTitle":       "@{triggerOutputs()?['body/planTitle']}",
    "bucketName":      "@{triggerOutputs()?['body/bucketName']}",
    "assignedTo":      "@{triggerOutputs()?['body/assignments']}",
    "dueDateTime":     "@{triggerOutputs()?['body/dueDateTime']}",
    "percentComplete": "@{triggerOutputs()?['body/percentComplete']}",
    "priority":        "@{triggerOutputs()?['body/priority']}",
    "description":     "@{triggerOutputs()?['body/description']}"
  }
  (Create one flow for "created" and one for "modified", both posting here.)

FLOW 4 — "Create Planner task" (set up in Power Automate):
  Trigger:  When an HTTP request is received
  Action:   Create a task (Planner) — map title/planId/bucketId/dueDate from body
  → copy the generated HTTP POST URL into config.json as "pa_create_task_url"
"""

import json
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import get_vault_path, load_config

router = APIRouter(tags=["planner"])

# ── Config ─────────────────────────────────────────────────────────────────────

def _pa_create_url() -> str:
    return load_config().get("pa_create_task_url", "")

# ── Index ──────────────────────────────────────────────────────────────────────

def _index_path() -> Path:
    return get_vault_path() / "planner_tasks.json"

def _load_index() -> dict:
    p = _index_path()
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}

def _save_index(index: dict):
    p = _index_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")

# ── Vault writer ───────────────────────────────────────────────────────────────

_PRIORITY = {1: "Urgent", 2: "Important", 3: "Medium", 5: "Normal", 9: "Low"}

def _write_task(task: dict):
    vault = get_vault_path()
    planner_dir = vault / "03_Backlog" / "planner"
    planner_dir.mkdir(parents=True, exist_ok=True)

    task_id = task.get("id", "unknown")
    title = task.get("title", "Untitled") or "Untitled"
    plan = task.get("planTitle", "") or ""
    bucket = task.get("bucketName", "") or ""
    assigned = task.get("assignedTo", "") or ""
    due = task.get("dueDateTime", "") or ""
    pct = int(task.get("percentComplete", 0) or 0)
    priority = int(task.get("priority", 5) or 5)
    description = task.get("description", "") or ""

    status = "Done" if pct == 100 else ("In Progress" if pct > 0 else "Not Started")
    priority_label = _PRIORITY.get(priority, "Normal")

    safe_title = "".join(c if c.isalnum() or c in " -_" else "_" for c in title)[:50].strip()
    filename = f"{task_id[:8]}_{safe_title}.md"

    content = f"""---
planner_id: {task_id}
title: {title}
plan: {plan}
bucket: {bucket}
assigned_to: {assigned}
due: {due}
status: {status}
priority: {priority_label}
percent_complete: {pct}
synced: {datetime.utcnow().isoformat()}
---

# {title}

| Field | Value |
|-------|-------|
| Plan | {plan} |
| Bucket | {bucket} |
| Assigned to | {assigned} |
| Due | {due or "—"} |
| Status | {status} ({pct}%) |
| Priority | {priority_label} |

{f"## Notes{chr(10)}{description}" if description else ""}
"""
    (planner_dir / filename).write_text(content, encoding="utf-8")

    index = _load_index()
    index[task_id] = {
        "id": task_id,
        "title": title,
        "plan": plan,
        "bucket": bucket,
        "status": status,
        "due": due,
        "priority": priority_label,
        "percentComplete": pct,
        "synced": datetime.utcnow().isoformat(),
    }
    _save_index(index)

# ── Webhook receiver (Flows 2a / 2b) ──────────────────────────────────────────

@router.post("/api/webhook/planner")
async def planner_webhook(request: Request):
    """Receives Planner task events from Power Automate."""
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Invalid JSON"}, status_code=400)

    tasks = data if isinstance(data, list) else [data]
    synced = 0
    errors = []

    for task in tasks:
        try:
            _write_task(task)
            synced += 1
        except Exception as e:
            errors.append(str(e))

    return {"ok": True, "synced": synced, "errors": errors}

# ── Planner task list (for frontend) ──────────────────────────────────────────

@router.get("/api/webhook/planner/tasks")
async def list_planner_tasks():
    index = _load_index()
    tasks = sorted(index.values(), key=lambda t: t.get("synced", ""), reverse=True)
    return {"tasks": tasks, "total": len(tasks)}

@router.get("/api/webhook/planner/status")
async def planner_status():
    index = _load_index()
    return {
        "synced_tasks": len(index),
        "has_tasks": len(index) > 0,
        "can_create": bool(_pa_create_url()),
    }

# ── Outbound: create task via Power Automate (Flow 4) ─────────────────────────

class CreateTaskRequest(BaseModel):
    title: str
    planId: str | None = None
    bucketId: str | None = None
    dueDate: str | None = None
    priority: int = 5

@router.post("/api/planner/tasks")
async def create_planner_task(req: CreateTaskRequest):
    url = _pa_create_url()
    if not url:
        raise HTTPException(status_code=503, detail="pa_create_task_url not configured in config.json")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, json={
                "title": req.title,
                "planId": req.planId,
                "bucketId": req.bucketId,
                "dueDate": req.dueDate,
                "priority": req.priority,
            })
        if not r.is_success:
            raise HTTPException(status_code=502, detail=f"Power Automate error: {r.text}")
        return {"ok": True}
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))
