"""
Compute attention items: overdue milestones, aging inbox,
stalled projects, ideas ready to promote.
"""
import re
from datetime import datetime, timedelta
from fastapi import APIRouter
from pathlib import Path

from config import get_vault_path
from parsers.frontmatter import parse_fm
from parsers.milestones import parse_milestones
from parsers.ideas_parser import parse_ideas
from parsers.backlog_parser import parse_backlog

router = APIRouter(prefix="/api/attention", tags=["attention"])

SKIP_FILES = {"project_registry.md"}
TODAY = None  # resolved at runtime


def _today():
    return datetime.now().date()


def _parse_date(s: str | None):
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(str(s), fmt).date()
        except ValueError:
            continue
    return None


def _projects_dir():
    return get_vault_path() / "01_Projects"


@router.get("")
def get_attention():
    today = _today()
    vault = get_vault_path()
    items = []

    # ── Overdue milestones ────────────────────────────────────────────────────
    for f in sorted(_projects_dir().glob("*.md")):
        if f.name in SKIP_FILES:
            continue
        fm, body = parse_fm(f)
        if not fm.get("name"):
            continue
        milestones = parse_milestones(body)
        for ms in milestones:
            if ms.done:
                continue
            due = _parse_date(ms.due)
            if due and due < today:
                items.append({
                    "type": "overdue_milestone",
                    "severity": "high",
                    "project_id": f.stem,
                    "project_name": str(fm.get("name", f.stem)),
                    "title": f"Overdue: {ms.title}",
                    "detail": f"Due {ms.due} · {ms.owner or 'unassigned'}",
                    "action": f"/projects/{f.stem}",
                })

    # ── Stalled projects (no file mod in >14 days) ────────────────────────────
    stale_cutoff = datetime.now() - timedelta(days=14)
    for f in sorted(_projects_dir().glob("*.md")):
        if f.name in SKIP_FILES:
            continue
        mtime = datetime.fromtimestamp(f.stat().st_mtime)
        if mtime < stale_cutoff:
            fm, _ = parse_fm(f)
            if not fm.get("name"):
                continue
            if str(fm.get("status", "")) in ("done", "archived", "cancelled"):
                continue
            items.append({
                "type": "stalled_project",
                "severity": "medium",
                "project_id": f.stem,
                "project_name": str(fm.get("name", f.stem)),
                "title": f"Stalled: {fm.get('name', f.stem)}",
                "detail": f"No updates in {(datetime.now() - mtime).days} days",
                "action": f"/projects/{f.stem}",
            })

    # ── Aging inbox (items older than 48h) ────────────────────────────────────
    inbox_path = vault / "00_Dashboard" / "inbox.md"
    if inbox_path.exists():
        from parsers.frontmatter import read_file
        content = read_file(inbox_path)
        match = re.search(r'## ✏️ Unreviewed(.*?)(?=\n##|\Z)', content, re.DOTALL)
        if match:
            for line in match.group(1).splitlines():
                line = line.strip()
                if not line.startswith("- "):
                    continue
                ts_match = re.match(r'- \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]', line)
                if ts_match:
                    ts = datetime.strptime(ts_match.group(1), "%Y-%m-%d %H:%M")
                    age_h = (datetime.now() - ts).total_seconds() / 3600
                    if age_h > 48:
                        text = line[2:].strip()
                        items.append({
                            "type": "aging_inbox",
                            "severity": "low",
                            "title": "Unreviewed inbox item",
                            "detail": f"Captured {int(age_h)}h ago: {text[:60]}",
                            "action": "/",
                        })

    # ── Ideas ready to promote ────────────────────────────────────────────────
    ideas_path = vault / "00_Dashboard" / "ideas.md"
    if ideas_path.exists():
        for idea in parse_ideas(ideas_path):
            if idea.maturity >= 90 and not idea.graduated:
                items.append({
                    "type": "ready_to_promote",
                    "severity": "low",
                    "title": f"Ready to promote: {idea.title}",
                    "detail": "All metadata filled · effort: low",
                    "action": "/ideas",
                })

    # Sort: high → medium → low
    sev_order = {"high": 0, "medium": 1, "low": 2}
    items.sort(key=lambda x: sev_order.get(x.get("severity", "low"), 2))
    return items


@router.get("/summary")
def attention_summary():
    """Quick counts for stat tiles."""
    vault = get_vault_path()
    from parsers.frontmatter import read_file
    from parsers.ideas_parser import parse_ideas

    active_projects = 0
    for f in _projects_dir().glob("*.md"):
        if f.name in SKIP_FILES:
            continue
        fm, _ = parse_fm(f)
        if fm.get("name") and fm.get("status") not in ("done", "cancelled"):
            active_projects += 1

    inbox_path = vault / "00_Dashboard" / "inbox.md"
    inbox_count = 0
    if inbox_path.exists():
        content = read_file(inbox_path)
        match = re.search(r'## ✏️ Unreviewed(.*?)(?=\n##|\Z)', content, re.DOTALL)
        if match:
            inbox_count = sum(
                1 for line in match.group(1).splitlines()
                if line.strip().startswith("- ") and not line.strip().startswith("<!--")
            )

    ideas_path = vault / "00_Dashboard" / "ideas.md"
    needs_refinement = 0
    ready_to_promote = 0
    if ideas_path.exists():
        for idea in parse_ideas(ideas_path):
            if not idea.graduated and not idea.done:
                if idea.maturity <= 10:
                    needs_refinement += 1
                if idea.maturity >= 90:
                    ready_to_promote += 1

    return {
        "active_projects": active_projects,
        "inbox_count": inbox_count,
        "ideas_needs_refinement": needs_refinement,
        "ideas_ready_to_promote": ready_to_promote,
    }
