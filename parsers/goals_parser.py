"""
Parse and write goals.md.

Format:
  ## goal-id
  - **Title:** Goal title
  - **Horizon:** H1 2026
  - **Status:** active
  - **Linked Projects:** slug-1, slug-2
"""
import re
from pathlib import Path
from typing import List
from models.goal import Goal
from parsers.frontmatter import read_file, write_file

_DEFAULT_CONTENT = """# Goals

Goals connect your long-term direction to active projects.
Format: ## goal-id with bullet metadata below.

"""


def _ensure_exists(path: Path) -> None:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        write_file(path, _DEFAULT_CONTENT)


def _extr_bullet(block: str, field: str) -> str | None:
    m = re.search(rf'\*\*{re.escape(field)}:\*\*\s*(.+)', block)
    return m.group(1).strip() if m else None


def parse_goals(path: Path) -> List[Goal]:
    _ensure_exists(path)
    content = read_file(path)
    goals: List[Goal] = []

    blocks = re.split(r'\n(?=##\s+)', content)
    for block in blocks:
        m = re.match(r'^##\s+(\S+)', block.strip())
        if not m:
            continue
        goal_id = m.group(1)
        title = _extr_bullet(block, 'Title') or goal_id
        horizon = _extr_bullet(block, 'Horizon')
        status = _extr_bullet(block, 'Status') or 'active'
        linked_raw = _extr_bullet(block, 'Linked Projects') or ''
        linked = [p.strip() for p in linked_raw.split(',') if p.strip()]

        goals.append(Goal(
            id=goal_id,
            title=title,
            horizon=horizon,
            status=status,
            linked_projects=linked,
        ))

    return goals


def add_goal(path: Path, goal: Goal) -> None:
    _ensure_exists(path)
    content = read_file(path)
    linked = ', '.join(goal.linked_projects) if goal.linked_projects else ''
    block = (
        f"\n## {goal.id}\n"
        f"- **Title:** {goal.title}\n"
        f"- **Horizon:** {goal.horizon or 'TBD'}\n"
        f"- **Status:** {goal.status}\n"
        f"- **Linked Projects:** {linked}\n"
    )
    write_file(path, content.rstrip('\n') + block)
