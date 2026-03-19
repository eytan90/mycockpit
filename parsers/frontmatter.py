"""
Frontmatter parser that uses python-frontmatter for reading
and careful regex-based writing to preserve file structure.
"""
import re
from pathlib import Path
from typing import Any
import frontmatter
import portalocker


def read_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def write_file(path: Path, content: str) -> None:
    with portalocker.Lock(str(path), "w", timeout=5, encoding="utf-8") as f:
        f.write(content)


def parse_fm(path: Path) -> tuple[dict, str]:
    """Return (frontmatter_dict, body_text)."""
    content = read_file(path)
    if not content:
        return {}, ""
    try:
        post = frontmatter.loads(content)
        return dict(post.metadata), post.content
    except Exception:
        return {}, content


def update_fm_field(path: Path, field: str, value: Any) -> None:
    """Update a single frontmatter scalar field in-place, preserving file format."""
    content = read_file(path)
    if not content:
        return

    # Find the frontmatter block boundaries
    m = re.match(r'^(---\n)(.*?)(\n---)', content, re.DOTALL)
    if not m:
        return

    fm_block = m.group(2)
    str_value = _to_yaml_scalar(value)

    # Try to replace existing field
    new_fm = re.sub(
        rf'^({re.escape(field)}\s*:).*$',
        rf'\g<1> {str_value}',
        fm_block,
        flags=re.MULTILINE
    )

    if new_fm == fm_block:
        # Field didn't exist — append it
        new_fm = fm_block.rstrip('\n') + f'\n{field}: {str_value}'

    new_content = content[:m.start(2)] + new_fm + content[m.end(2):]
    write_file(path, new_content)


def _to_yaml_scalar(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, list):
        return "[" + ", ".join(str(v) for v in value) + "]"
    s = str(value)
    # Quote if contains special chars
    if any(c in s for c in [':', '#', '{', '}', '[', ']', '&', '*', '?', '|', '-', '<', '>', '=', '!', '%', '@', '`']):
        return f'"{s}"'
    return s
