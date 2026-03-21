import re
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import get_vault_path
from parsers.frontmatter import read_file, write_file

router = APIRouter(prefix="/api/planner", tags=["planner"])


def _inbox_path():
    return get_vault_path() / "00_Dashboard" / "inbox.md"


def _backlog_path():
    return get_vault_path() / "master_backlog.md"


def _append_to_inbox(text: str) -> None:
    content = read_file(_inbox_path())
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    new_line = f"- [{ts}] {text}\n"
    marker = "<!-- Add new items below this line. One idea or task per line. Claude handles the rest. -->"
    if marker in content:
        content = content.replace(marker, marker + "\n" + new_line, 1)
    else:
        content = re.sub(r'(## ✏️ Unreviewed\n)', r'\g<1>' + new_line, content)
    write_file(_inbox_path(), content)


# ── Inbound: Planner task created (Flows 3 & 6) ──────────────────────────────

class PlannerTaskWebhook(BaseModel):
    task_id: Optional[str] = ""
    title: str
    assigned_to: Optional[str] = ""
    assigned_by: Optional[str] = ""     # set by Power Automate when a teammate assigns you
    due_date: Optional[str] = ""        # ISO date string e.g. "2026-03-25"
    bucket: Optional[str] = ""
    plan_name: Optional[str] = ""
    priority: Optional[str] = "normal"  # "urgent" | "important" | "normal" | "low"
    url: Optional[str] = ""


@router.post("/task")
def planner_task_webhook(body: PlannerTaskWebhook):
    """
    Webhook endpoint for Power Automate.

    Flow 3 — New Planner task created in your plan → captured to inbox.
    Flow 6 — Team member assigns a task to you → captured with source attribution.

    Power Automate setup:
      Trigger: "When a task is assigned to me" or "When a new task is created"
      Action: HTTP POST to /api/planner/task
    """
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "title is required")

    assigned_by = (body.assigned_by or "").strip()
    plan = (body.plan_name or "").strip()
    due = f" [due:: {body.due_date}]" if body.due_date else ""
    plan_label = f" [{plan}]" if plan else ""

    if assigned_by:
        # Flow 6: team member assigned this task to you
        entry = f"Task from {assigned_by}{plan_label}: {title}{due}"
    else:
        # Flow 3: general Planner task
        entry = f"Planner task{plan_label}: {title}{due}"

    _append_to_inbox(entry)
    return {"captured": True, "entry": entry}


# ── Inbound: Planner task updated / completed (Flow 5) ───────────────────────

class PlannerUpdateWebhook(BaseModel):
    task_id: Optional[str] = ""
    title: str
    new_status: str     # "not started" | "in progress" | "completed" | "deferred" | "waiting on someone else"
    completed_by: Optional[str] = ""
    plan_name: Optional[str] = ""
    url: Optional[str] = ""


_STATUS_MAP = {
    "completed": "done",
    "in progress": "in-progress",
    "not started": "backlog",
    "deferred": "deferred",
    "waiting on someone else": "waiting",
}


@router.post("/update")
def planner_update_webhook(body: PlannerUpdateWebhook):
    """
    Webhook endpoint for Power Automate.

    Flow 5 — Task updated or completed in Planner → syncs status in master_backlog.md.
    Matches by title substring. If not found in backlog, falls back to an inbox note.

    Power Automate setup:
      Trigger: "When a task is completed" or "When a task is updated"
      Action: HTTP POST to /api/planner/update
    """
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "title is required")

    mc_status = _STATUS_MAP.get(body.new_status.lower().strip(), "backlog")
    content = read_file(_backlog_path())
    lines = content.split('\n')
    updated = False

    for i, line in enumerate(lines):
        if title.lower() in line.lower() and line.strip().startswith('- '):
            # Update or insert status tag
            if '[status::' in line:
                lines[i] = re.sub(r'\[status::\s*[\w-]+\]', f'[status:: {mc_status}]', line)
            else:
                lines[i] = line.rstrip() + f' [status:: {mc_status}]'
            # Sync checkbox
            if mc_status == 'done' and '- [ ]' in lines[i]:
                lines[i] = lines[i].replace('- [ ]', '- [x]', 1)
            elif mc_status != 'done' and '- [x]' in lines[i]:
                lines[i] = lines[i].replace('- [x]', '- [ ]', 1)
            updated = True
            break

    if updated:
        write_file(_backlog_path(), '\n'.join(lines))
        return {"updated": True, "task": title, "new_status": mc_status}

    # Task not found in backlog — capture as an inbox note
    entry = f"Planner update: '{title}' → {body.new_status}"
    _append_to_inbox(entry)
    return {"updated": False, "note": "task not found in backlog, captured to inbox", "entry": entry}
