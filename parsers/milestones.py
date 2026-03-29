"""
Parse and update milestone lines in project .md files.

Milestone format:
  - [x] Title [owner:: Name] [status:: done]
  - [ ] Title [owner:: Name] [due:: 2026-05-01] [status:: pending]
"""
import re
from pathlib import Path
from typing import List
from models.project import Milestone
from parsers.frontmatter import read_file, write_file


_INLINE_TAG = re.compile(r'\[(\w+)::\s*([^\]]+)\]')
_MILESTONE_LINE = re.compile(r'^- \[(.)\]\s+(.+)$')


def _extr(text: str, tag: str) -> str | None:
    m = re.search(rf'\[{tag}::\s*([^\]]+)\]', text)
    return m.group(1).strip() if m else None


def parse_milestones(body: str) -> List[Milestone]:
    milestones = []
    in_milestones = False
    idx = 0

    for line in body.splitlines():
        stripped = line.strip()

        if re.match(r'^##\s+Milestones', stripped):
            in_milestones = True
            continue
        if in_milestones and re.match(r'^##\s+', stripped):
            in_milestones = False
            continue
        if not in_milestones:
            continue

        m = _MILESTONE_LINE.match(stripped)
        if not m:
            continue

        marker, rest = m.group(1), m.group(2)
        done = marker == 'x'

        owner = _extr(rest, 'owner')
        start = _extr(rest, 'start')
        due = _extr(rest, 'due')
        status = _extr(rest, 'status')

        # Strip all inline tags to get clean title
        title = re.sub(r'\[[^\]]+\]', '', rest).strip().rstrip(' —-·')
        title = re.sub(r'\*\*(.+?)\*\*', r'\1', title).strip()

        milestones.append(Milestone(
            index=idx,
            title=title or "Untitled",
            done=done,
            owner=owner,
            start=start if start and start.upper() != "TBD" else None,
            due=due if due and due.upper() != "TBD" else None,
            status=status or ("done" if done else "pending"),
        ))
        idx += 1

    return milestones


def toggle_milestone(path: Path, index: int, done: bool) -> None:
    """Toggle a milestone's checkbox and status tag in the file."""
    content = read_file(path)
    lines = content.splitlines(keepends=True)

    milestone_idx = 0
    in_milestones = False

    for i, line in enumerate(lines):
        stripped = line.strip()
        if re.match(r'^##\s+Milestones', stripped):
            in_milestones = True
            continue
        if in_milestones and re.match(r'^##\s+', stripped):
            in_milestones = False
            continue
        if not in_milestones:
            continue

        if not _MILESTONE_LINE.match(stripped):
            continue

        if milestone_idx == index:
            # Toggle the checkbox
            if done:
                new_line = re.sub(r'^(\s*- )\[ \]', r'\g<1>[x]', line)
                # Update or add status:: done
                if re.search(r'\[status::', new_line):
                    new_line = re.sub(r'\[status::\s*[^\]]+\]', '[status:: done]', new_line)
                else:
                    new_line = new_line.rstrip('\n') + ' [status:: done]\n'
            else:
                new_line = re.sub(r'^(\s*- )\[x\]', r'\g<1>[ ]', line)
                if re.search(r'\[status::', new_line):
                    new_line = re.sub(r'\[status::\s*[^\]]+\]', '[status:: pending]', new_line)
            lines[i] = new_line
            break

        milestone_idx += 1

    write_file(path, "".join(lines))
