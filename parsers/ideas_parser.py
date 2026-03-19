"""
Parse and update ideas.md.

Idea line formats:
  - [ ] **Title** [area:: X] [from:: Y] [effort:: low/med/high] [added:: date] [stage:: X]
  - [x] **Title** ...  (done)
  - [>] **Title** ...  (graduated to backlog)
"""
import re
from datetime import datetime
from pathlib import Path
from typing import List
from models.idea import Idea
from parsers.frontmatter import read_file, write_file


_IDEA_LINE = re.compile(r'^- \[(.)\]\s+(.+)$')


def _extr(text: str, tag: str) -> str | None:
    m = re.search(rf'\[{re.escape(tag)}::\s*([^\]]+)\]', text)
    return m.group(1).strip() if m else None


def _score(area, effort, from_) -> tuple[int, str, str]:
    has_meta = bool(area and area != '?' and effort and effort != '?' and from_ and from_ != '?')
    if effort == 'low' and has_meta:
        return 90, "Ready to promote", "#3ECF8E"
    elif effort == 'med' and has_meta:
        return 60, "Needs scoping", "#F5A623"
    elif effort == 'high' and has_meta:
        return 30, "Long-term", "#4A8FFF"
    else:
        return 10, "Needs refinement", "#F5A623"


def parse_ideas(path: Path) -> List[Idea]:
    content = read_file(path)
    ideas: List[Idea] = []
    current_section = "Uncategorized"
    idx = 0

    for line in content.splitlines():
        stripped = line.strip()

        m_sec = re.match(r'^##\s+(.+)', stripped)
        if m_sec:
            current_section = m_sec.group(1).strip()
            continue

        m = _IDEA_LINE.match(stripped)
        if not m:
            continue

        marker, rest = m.group(1), m.group(2)
        done = (marker == 'x')
        graduated = (marker == '>')

        area = _extr(rest, 'area')
        effort = _extr(rest, 'effort')
        from_ = _extr(rest, 'from')
        stage = _extr(rest, 'stage')
        added = _extr(rest, 'added')

        # Clean title
        title_raw = re.sub(r'\[[^\]]+\]', '', rest).strip(' —-·')
        title = re.sub(r'\*\*(.+?)\*\*', r'\1', title_raw).split('—')[0].strip()[:80]

        maturity, mat_label, mat_color = _score(area, effort, from_)

        ideas.append(Idea(
            index=idx,
            title=title or "Untitled",
            raw_line=stripped,
            section=current_section,
            area=area,
            effort=effort,
            from_=from_,
            stage=stage,
            added=added,
            done=done,
            graduated=graduated,
            maturity=maturity,
            mat_label=mat_label,
            mat_color=mat_color,
        ))
        idx += 1

    return ideas


def update_idea(path: Path, index: int, updates: dict) -> None:
    """Update inline tags on an idea line by its global index."""
    content = read_file(path)
    lines = content.splitlines(keepends=True)

    idea_idx = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not _IDEA_LINE.match(stripped):
            continue

        if idea_idx == index:
            indent = len(line) - len(line.lstrip())
            prefix = line[:indent]
            new_line = stripped
            remaining = dict(updates)

            # Title is not a tag — handle separately
            if 'title' in remaining:
                new_title = remaining.pop('title')
                if '**' in new_line:
                    new_line = re.sub(r'\*\*[^*]+\*\*', f'**{new_title}**', new_line, count=1)
                else:
                    m2 = re.match(r'^(- \[.\]\s+)(\S[^\[]*?)\s*(\[.*)?$', new_line)
                    if m2:
                        tags_part = (m2.group(3) or '').strip()
                        new_line = m2.group(1) + new_title + (' ' + tags_part if tags_part else '')

            for tag, value in remaining.items():
                if re.search(rf'\[{re.escape(tag)}::', new_line):
                    new_line = re.sub(
                        rf'\[{re.escape(tag)}::\s*[^\]]+\]',
                        f'[{tag}:: {value}]',
                        new_line
                    )
                else:
                    new_line = new_line.rstrip() + f' [{tag}:: {value}]'

            lines[i] = prefix + new_line + '\n'
            break

        idea_idx += 1

    write_file(path, "".join(lines))


def promote_to_backlog(idea: Idea, backlog_path: Path) -> None:
    content = read_file(backlog_path)
    ts = datetime.now().strftime("%Y-%m-%d")
    entry = (
        f"- [ ] **{idea.title}** "
        f"[area:: {idea.area or '?'}] "
        f"[from:: {idea.from_ or 'Eytan'}] "
        f"[promoted:: {ts}] [status:: backlog]\n"
    )
    write_file(backlog_path, content.rstrip('\n') + '\n' + entry)


def graduate_idea(raw_line: str, path: Path) -> None:
    content = read_file(path)
    graduated = raw_line.replace("- [ ]", "- [>]", 1)
    content = content.replace(raw_line + "\n", "")
    marker = "## \u2705 Graduated to Backlog / Projects"
    if marker in content:
        content = content.replace(marker + "\n", marker + "\n" + graduated + "\n")
    else:
        content = content.rstrip('\n') + f"\n{marker}\n{graduated}\n"
    write_file(path, content)
