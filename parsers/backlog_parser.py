"""
Parse master_backlog.md — supports two formats:

1. Table rows:  | 1.1 | Item | ✅ Done | Notes |
2. List items:  - [ ] Item [area:: X] [from:: Y] [added:: date]
"""
import re
from datetime import datetime
from pathlib import Path
from typing import List
from models.task import Task
from parsers.frontmatter import read_file, write_file

_STATUS_MAP = {
    '✅': 'done', 'Done': 'done',
    '🟡': 'in-progress', 'In Progress': 'in-progress',
    '🔵': 'up-next', 'Up Next': 'up-next',
    '⬜': 'backlog', 'Backlog': 'backlog',
    '💡': 'idea', 'Idea': 'idea',
}


def _norm_status(raw: str) -> str:
    for k, v in _STATUS_MAP.items():
        if k in raw:
            return v
    return 'backlog'


def _extr(text: str, tag: str) -> str | None:
    m = re.search(rf'\[{re.escape(tag)}::\s*([^\]]+)\]', text)
    return m.group(1).strip() if m else None


def parse_backlog(path: Path) -> List[Task]:
    content = read_file(path)
    tasks: List[Task] = []
    current_section = "Uncategorized"

    for line in content.splitlines():
        stripped = line.strip()

        # Section header
        m_sec = re.match(r'^##\s+(\d+\..+|.+)', stripped)
        if m_sec:
            current_section = m_sec.group(1).strip()
            continue

        # Table row
        if re.match(r'^\|', stripped) and '---' not in stripped and 'Status' not in stripped:
            cols = [c.strip() for c in stripped.split('|') if c.strip()]
            if len(cols) >= 3:
                task_id = cols[0] if re.match(r'[\d.]+', cols[0]) else f"t{len(tasks)}"
                title = re.sub(r'\*\*(.+?)\*\*', r'\1', cols[1]).strip()
                status = _norm_status(cols[2])
                notes = cols[3] if len(cols) > 3 else None
                tasks.append(Task(
                    id=task_id,
                    title=title,
                    status=status,
                    notes=notes,
                    section=current_section,
                    source="table",
                ))
            continue

        # List item
        m_list = re.match(r'^- \[(.)\]\s+(.+)$', stripped)
        if m_list:
            marker, rest = m_list.group(1), m_list.group(2)
            status_tag = _extr(rest, 'status')
            done = marker == 'x'
            status = status_tag or ('done' if done else 'backlog')

            area = _extr(rest, 'area')
            from_ = _extr(rest, 'from')
            added = _extr(rest, 'added')
            project_ref = _extr(rest, 'project_ref')

            title_raw = re.sub(r'\[[^\]]+\]', '', rest).strip(' —-·')
            title = re.sub(r'\*\*(.+?)\*\*', r'\1', title_raw).strip()

            tasks.append(Task(
                id=f"l{len(tasks)}",
                title=title[:120],
                status=status,
                area=area,
                from_=from_,
                added=added,
                project_ref=project_ref,
                section=current_section,
                source="list",
            ))

    return tasks


def parse_backlog_sections(path: Path) -> list:
    """Return section progress summaries for the backlog overview."""
    content = read_file(path)
    sections = []
    current = None

    for line in content.splitlines():
        m = re.match(r'^##\s+(\d+\..+)', line.strip())
        if m:
            if current:
                sections.append(current)
            current = {"title": m.group(1), "done": 0, "total": 0}
            continue
        if not current:
            continue
        if re.match(r'^\|.*\|', line):
            if '---' in line or 'Status' in line:
                continue
            cols = [c.strip() for c in line.split('|') if c.strip()]
            if len(cols) >= 3:
                current["total"] += 1
                if '✅' in cols[2] or 'Done' in cols[2]:
                    current["done"] += 1

    if current:
        sections.append(current)
    return sections


_STATUS_WRITE_MAP = {
    'done': '✅ Done',
    'in-progress': '🟡 In Progress',
    'up-next': '🔵 Up Next',
    'backlog': '⬜ Backlog',
}


def _task_line_map(content: str) -> list:
    """Return [{id, line_idx, source}] mirroring parse_backlog counting."""
    result = []
    count = 0
    for i, line in enumerate(content.splitlines()):
        stripped = line.strip()
        if re.match(r'^\|', stripped) and '---' not in stripped and 'Status' not in stripped:
            cols = [c.strip() for c in stripped.split('|') if c.strip()]
            if len(cols) >= 3:
                tid = cols[0] if re.match(r'[\d.]+', cols[0]) else f"t{count}"
                result.append({'id': tid, 'line_idx': i, 'source': 'table'})
                count += 1
        elif re.match(r'^- \[.\]', stripped):
            result.append({'id': f"l{count}", 'line_idx': i, 'source': 'list'})
            count += 1
    return result


def patch_task(path: Path, task_id: str, updates: dict) -> bool:
    """Update a task in master_backlog.md by its task_id."""
    content = read_file(path)
    task_map = _task_line_map(content)
    target = next((t for t in task_map if t['id'] == task_id), None)
    if not target:
        return False

    raw_lines = content.splitlines(keepends=True)
    line = raw_lines[target['line_idx']]

    if target['source'] == 'list':
        if 'title' in updates:
            m = re.match(r'^(\s*- \[.\] )(.+)$', line.rstrip('\n'))
            if m:
                rest = m.group(2)
                tags = re.findall(r'\[[^\]]+::[^\]]+\]', rest)
                line = m.group(1) + updates['title']
                if tags:
                    line += ' ' + ' '.join(tags)
                line += '\n'
        if 'status' in updates:
            status = updates['status']
            marker = 'x' if status == 'done' else ' '
            line = re.sub(r'^(\s*- \[)[x ](\])', rf'\g<1>{marker}\2', line)
            if '[status::' in line:
                line = re.sub(r'\[status::\s*[^\]]+\]', f'[status:: {status}]', line)
            else:
                line = line.rstrip('\n') + f' [status:: {status}]\n'
        if 'area' in updates:
            if '[area::' in line:
                line = re.sub(r'\[area::\s*[^\]]+\]', f'[area:: {updates["area"]}]', line)
            else:
                line = line.rstrip('\n') + f' [area:: {updates["area"]}]\n'
    else:  # table
        cols = line.split('|')
        if len(cols) >= 5:
            if 'title' in updates:
                cols[2] = f' {updates["title"]} '
            if 'status' in updates:
                cols[3] = f' {_STATUS_WRITE_MAP.get(updates["status"], updates["status"])} '
            line = '|'.join(cols)

    raw_lines[target['line_idx']] = line
    write_file(path, ''.join(raw_lines))
    return True


def append_task(path: Path, text: str, area: str = "", from_: str = "Eytan") -> None:
    content = read_file(path)
    ts = datetime.now().strftime("%Y-%m-%d")
    parts = [f"- [ ] {text}"]
    if area:
        parts[0] += f" [area:: {area}]"
    parts[0] += f" [from:: {from_}] [added:: {ts}] [status:: backlog]"
    entry = parts[0] + "\n"
    write_file(path, content.rstrip('\n') + '\n' + entry)
