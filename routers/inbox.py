import re
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

from config import get_vault_path
from parsers.frontmatter import read_file, write_file

router = APIRouter(prefix="/api/inbox", tags=["inbox"])

TASK_WORDS = [
    "fix", "update", "check", "review", "call", "email", "schedule", "meet",
    "send", "follow up", "contact", "confirm", "remind", "migrate", "test",
    "compare", "run", "write", "complete", "finish", "submit", "add to",
]
IDEA_WORDS = [
    "idea", "propose", "what if", "could we", "maybe", "consider", "explore",
    "investigate", "research", "new project", "new tool", "build a", "create a",
    "develop a", "design a", "implement", "automate",
]


def _inbox_path():
    return get_vault_path() / "00_Dashboard" / "inbox.md"

def _backlog_path():
    return get_vault_path() / "master_backlog.md"

def _ideas_path():
    return get_vault_path() / "00_Dashboard" / "ideas.md"


def _get_unreviewed() -> List[str]:
    content = read_file(_inbox_path())
    match = re.search(r'## ✏️ Unreviewed(.*?)(?=\n##|\Z)', content, re.DOTALL)
    if not match:
        return []
    items = []
    for line in match.group(1).splitlines():
        line = line.strip()
        if line.startswith("- ") and not line.startswith("<!--"):
            items.append(line[2:])
    return items


def _classify(text: str) -> str:
    t = text.lower()
    ts = sum(1 for w in TASK_WORDS if w in t)
    is_ = sum(1 for w in IDEA_WORDS if w in t)
    return "TASK" if ts > is_ else "IDEA"


def _file_item(raw_item: str) -> dict:
    text = re.sub(r'^\[[^\]]+\]\s*', '', raw_item).strip()
    category = _classify(text)
    date = datetime.now().strftime("%Y-%m-%d")

    if category == "TASK":
        content = read_file(_backlog_path())
        entry = f"- [ ] {text} [from:: Eytan] [added:: {date}] [status:: backlog]\n"
        write_file(_backlog_path(), content.rstrip('\n') + '\n' + entry)
        destination = "master_backlog.md"
    else:
        content = read_file(_ideas_path())
        entry = f"- [ ] **{text[:80]}** [area:: ?] [from:: Eytan] [effort:: ?] [added:: {date}]\n"
        target = "## \U0001f52c Testing & Infrastructure"
        if target in content:
            content = content.replace(target + "\n", target + "\n" + entry)
        else:
            content = content.rstrip('\n') + '\n' + entry
        write_file(_ideas_path(), content)
        destination = "ideas.md"

    return {"raw": raw_item, "text": text[:80], "category": category, "destination": destination}


def _clear_items(results: list) -> None:
    content = read_file(_inbox_path())
    ts = datetime.now().strftime("%Y-%m-%d")
    for item in results:
        content = content.replace(f"- {item['raw']}\n", "")
        processed = f"- [{ts}] [{item['category']}] {item['raw']} → filed to {item['destination']}\n"
        content = re.sub(
            r'(## 🗂️ Processed\n(?:<!--.*?-->\n)?)',
            r'\g<1>' + processed,
            content, flags=re.DOTALL
        )
    write_file(_inbox_path(), content)


@router.get("", response_model=List[str])
def get_inbox():
    return _get_unreviewed()


class CaptureBody(BaseModel):
    text: str


@router.post("")
def capture(body: CaptureBody):
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Empty text")
    content = read_file(_inbox_path())
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    new_line = f"- [{ts}] {text}\n"
    marker = "<!-- Add new items below this line. One idea or task per line. Claude handles the rest. -->"
    if marker in content:
        content = content.replace(marker, marker + "\n" + new_line, 1)
    else:
        content = re.sub(r'(## ✏️ Unreviewed\n)', r'\g<1>' + new_line, content)
    write_file(_inbox_path(), content)
    return {"ok": True}


@router.post("/review")
def review_now():
    items = _get_unreviewed()
    if not items:
        return {"processed": [], "message": "Inbox already clear."}
    results = [_file_item(item) for item in items]
    _clear_items(results)
    return {"processed": results}
