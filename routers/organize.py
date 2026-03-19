"""
POST /api/organize — full vault sync:
  1. Re-sync all project milestone counts in frontmatter
  2. Auto-classify unreviewed inbox items
  3. Return a report: changes made + flags needing human review
"""
from datetime import datetime, date
from pathlib import Path
from fastapi import APIRouter

from config import get_vault_path
from parsers.frontmatter import parse_fm, update_fm_field, read_file, write_file
from parsers.milestones import parse_milestones
from routers.inbox import _get_unreviewed, _file_item, _clear_items

router = APIRouter(prefix="/api/organize", tags=["organize"])

SKIP_FILES = {"project_registry.md"}


def _projects_dir() -> Path:
    return get_vault_path() / "01_Projects"


def _sync_projects() -> dict:
    """Re-calculate milestone counts and progress for every project file."""
    d = _projects_dir()
    if not d.exists():
        return {"synced": [], "flags": []}

    synced = []
    flags = []
    today = date.today()

    for f in sorted(d.glob("*.md")):
        if f.name in SKIP_FILES:
            continue

        fm, body = parse_fm(f)
        if not fm.get("name"):
            continue

        name = str(fm.get("name", f.stem))
        milestones = parse_milestones(body)
        total = len(milestones)
        done = sum(1 for m in milestones if m.done)
        wip = sum(1 for m in milestones if m.status and "progress" in m.status)
        calc_progress = round(done / total * 100) if total > 0 else 0

        changes = []

        # Sync progress if it drifted
        old_progress = int(fm.get("progress", 0))
        if total > 0 and old_progress != calc_progress:
            update_fm_field(f, "progress", calc_progress)
            changes.append(f"progress {old_progress}% → {calc_progress}%")

        # Sync milestone counts
        if int(fm.get("milestones_total", -1)) != total:
            update_fm_field(f, "milestones_total", total)
            update_fm_field(f, "milestones_done", done)
            update_fm_field(f, "milestones_wip", wip)
            changes.append(f"milestone counts updated ({done}/{total})")

        if changes:
            synced.append({"project": name, "changes": changes})

        # Flags
        status = str(fm.get("status", ""))
        target_raw = str(fm.get("target_date", "") or "")

        if not fm.get("owner"):
            flags.append({"project": name, "issue": "No owner assigned"})

        if not target_raw and status not in ("done", "cancelled"):
            flags.append({"project": name, "issue": "No target date set"})

        if target_raw and status not in ("done", "cancelled"):
            try:
                td = date.fromisoformat(target_raw)
                if td < today:
                    flags.append({"project": name, "issue": f"Overdue (target: {target_raw})"})
            except ValueError:
                pass

        if status == "stalled":
            flags.append({"project": name, "issue": "Status is stalled — needs attention"})

        if status == "in-progress" and calc_progress == 0 and total > 0:
            flags.append({"project": name, "issue": "In-progress but 0% milestone completion"})

    return {"synced": synced, "flags": flags}


def _sync_inbox() -> dict:
    """Classify and file all unreviewed inbox items."""
    items = _get_unreviewed()
    if not items:
        return {"classified": []}
    results = [_file_item(item) for item in items]
    _clear_items(results)
    return {"classified": results}


@router.post("")
def run_organize():
    started = datetime.now().isoformat(timespec="seconds")

    project_result = _sync_projects()
    inbox_result = _sync_inbox()

    return {
        "ran_at": started,
        "projects_synced": len(project_result["synced"]),
        "project_changes": project_result["synced"],
        "inbox_classified": len(inbox_result["classified"]),
        "inbox_items": inbox_result["classified"],
        "flags": project_result["flags"],
    }
