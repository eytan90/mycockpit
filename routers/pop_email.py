"""
POP3/SMTP email router — replaces Microsoft Graph-based email.py.
Reads via POP3, sends via SMTP, caches messages locally, writes to vault.
"""

import asyncio
import email as email_lib
import hashlib
import json
import poplib
import re
import smtplib
from datetime import datetime
from email.header import decode_header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import parsedate_to_datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import get_vault_path, load_config

router = APIRouter(prefix="/api/email", tags=["email"])

# ── Config ─────────────────────────────────────────────────────────────────────

def _cfg() -> dict:
    return load_config()

def _pop_cfg():
    cfg = _cfg()
    return (
        cfg.get("pop_host", "outlook.office365.com"),
        int(cfg.get("pop_port", 995)),
        cfg.get("email_user", ""),
        cfg.get("email_password", ""),
    )

def _smtp_cfg():
    cfg = _cfg()
    return (
        cfg.get("smtp_host", "smtp.office365.com"),
        int(cfg.get("smtp_port", 587)),
        cfg.get("email_user", ""),
        cfg.get("email_password", ""),
    )

def _is_configured() -> bool:
    cfg = _cfg()
    return bool(cfg.get("email_user") and cfg.get("email_password"))

# ── Cache ──────────────────────────────────────────────────────────────────────

def _cache_path() -> Path:
    return get_vault_path() / "email_cache.json"

def _load_cache() -> list[dict]:
    p = _cache_path()
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []

def _save_cache(messages: list[dict]):
    p = _cache_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(messages, ensure_ascii=False, indent=2), encoding="utf-8")

# ── Email parsing ──────────────────────────────────────────────────────────────

def _decode_val(val: str) -> str:
    if not val:
        return ""
    parts = decode_header(val)
    result = []
    for b, charset in parts:
        if isinstance(b, bytes):
            result.append(b.decode(charset or "utf-8", errors="replace"))
        else:
            result.append(b)
    return "".join(result)

def _parse_addr(raw: str) -> tuple[str, str]:
    """Returns (name, address) from 'Name <addr>' or 'addr'."""
    raw = raw.strip()
    if "<" in raw:
        name = raw.split("<")[0].strip().strip('"').strip("'")
        addr = raw.split("<")[1].rstrip(">").strip()
    else:
        name = raw
        addr = raw
    return name, addr

def _get_body(msg: email_lib.message.Message) -> tuple[str, str]:
    """Returns (body, body_type) — prefers HTML."""
    html_body = ""
    text_body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/html" and not html_body:
                payload = part.get_payload(decode=True)
                if payload:
                    html_body = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
            elif ct == "text/plain" and not text_body:
                payload = part.get_payload(decode=True)
                if payload:
                    text_body = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            ct = msg.get_content_type()
            body = payload.decode(msg.get_content_charset() or "utf-8", errors="replace")
            if ct == "text/html":
                html_body = body
            else:
                text_body = body
    if html_body:
        return html_body, "html"
    return text_body, "text"

def _parse_date(msg: email_lib.message.Message) -> str:
    try:
        return parsedate_to_datetime(msg.get("Date", "")).isoformat()
    except Exception:
        return datetime.utcnow().isoformat()

def _msg_id(msg: email_lib.message.Message) -> str:
    mid = msg.get("Message-ID", "")
    if not mid:
        mid = hashlib.md5(f"{msg.get('Subject','')}{msg.get('Date','')}".encode()).hexdigest()
    return mid.strip("<>").strip()

def _parse_raw(lines: list[bytes]) -> dict:
    raw = b"\r\n".join(lines)
    msg = email_lib.message_from_bytes(raw)

    from_name, from_addr = _parse_addr(_decode_val(msg.get("From", "")))
    subject = _decode_val(msg.get("Subject", "(no subject)"))
    body, body_type = _get_body(msg)
    date_iso = _parse_date(msg)
    msg_id = _msg_id(msg)

    preview = re.sub(r"<[^>]+>", "", body)[:200].replace("\n", " ").strip()

    to_list = []
    for part in _decode_val(msg.get("To", "")).split(","):
        n, a = _parse_addr(part)
        if a:
            to_list.append({"name": n, "address": a})

    return {
        "id": msg_id,
        "from": from_name or from_addr,
        "fromAddress": from_addr,
        "to": to_list,
        "subject": subject,
        "preview": preview,
        "date": date_iso,
        "isRead": False,
        "hasAttachment": any(
            part.get_content_disposition() == "attachment"
            for part in email_lib.message_from_bytes(raw).walk()
        ),
        "importance": "normal",
        "body": body,
        "bodyType": body_type,
    }

# ── Vault writer ───────────────────────────────────────────────────────────────

def _write_to_vault(msg: dict):
    vault = get_vault_path()
    inbox_dir = vault / "09_Inbox" / "emails"
    inbox_dir.mkdir(parents=True, exist_ok=True)

    date_str = msg["date"][:10] if msg["date"] else "unknown"
    subject_safe = re.sub(r"[^\w\s-]", "_", msg["subject"])[:50].strip()
    filename = f"{date_str}_{subject_safe}.md"

    body_plain = re.sub(r"<[^>]+>", "", msg["body"]) if msg["bodyType"] == "html" else msg["body"]

    content = f"""---
id: {msg["id"]}
from: {msg["fromAddress"]}
from_name: {msg["from"]}
subject: {msg["subject"]}
date: {msg["date"]}
synced: {datetime.utcnow().isoformat()}
---

# {msg["subject"]}

**From:** {msg["from"]} <{msg["fromAddress"]}>
**Date:** {msg["date"]}

---

{body_plain.strip()}
"""
    (inbox_dir / filename).write_text(content, encoding="utf-8")

# ── POP3 sync ──────────────────────────────────────────────────────────────────

def sync_pop3() -> int:
    """Fetch new emails via POP3. Returns count of new messages added."""
    host, port, user, pwd = _pop_cfg()
    if not user or not pwd:
        raise RuntimeError("Email credentials not configured in config.json")

    existing = _load_cache()
    existing_ids = {m["id"] for m in existing}

    pop = poplib.POP3_SSL(host, port)
    try:
        pop.user(user)
        pop.pass_(pwd)
        num_msgs = len(pop.list()[1])
        new_messages = []

        # Fetch most recent 50 messages
        start = max(1, num_msgs - 49)
        for i in range(num_msgs, start - 1, -1):
            try:
                _, lines, _ = pop.retr(i)
                parsed = _parse_raw(lines)
                if parsed["id"] not in existing_ids:
                    new_messages.append(parsed)
            except Exception:
                continue
    finally:
        try:
            pop.quit()
        except Exception:
            pass

    if new_messages:
        combined = new_messages + existing
        _save_cache(combined[:200])
        for m in new_messages:
            _write_to_vault(m)

    return len(new_messages)

# ── SMTP send ──────────────────────────────────────────────────────────────────

def smtp_send(to: str, subject: str, body: str, reply_to_id: str | None = None):
    smtp_host, smtp_port, user, pwd = _smtp_cfg()
    if not user or not pwd:
        raise RuntimeError("Email credentials not configured in config.json")

    msg = MIMEMultipart("alternative")
    msg["From"] = user
    msg["To"] = to
    msg["Subject"] = subject
    if reply_to_id:
        msg["In-Reply-To"] = f"<{reply_to_id}>"
        msg["References"] = f"<{reply_to_id}>"

    body_type = "html" if re.search(r"<[a-zA-Z]", body) else "plain"
    msg.attach(MIMEText(body, body_type, "utf-8"))

    with smtplib.SMTP(smtp_host, smtp_port) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(user, pwd)
        smtp.send_message(msg)

# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/status")
async def email_status():
    cfg = _cfg()
    user = cfg.get("email_user", "")
    pwd = cfg.get("email_password", "")
    return {"connected": bool(user and pwd), "account": user or None}

@router.get("/inbox")
async def list_inbox(top: int = 50, skip: int = 0):
    messages = _load_cache()
    page = messages[skip : skip + top]
    summaries = [{k: v for k, v in m.items() if k != "body"} for m in page]
    return {"messages": summaries, "total": len(messages)}

@router.get("/{message_id}")
async def get_message(message_id: str):
    for m in _load_cache():
        if m["id"] == message_id:
            return m
    raise HTTPException(status_code=404, detail="Message not found")

@router.post("/{message_id}/read")
async def mark_read(message_id: str):
    messages = _load_cache()
    for m in messages:
        if m["id"] == message_id:
            m["isRead"] = True
    _save_cache(messages)
    return {"ok": True}

class SendRequest(BaseModel):
    to: str
    subject: str
    body: str
    bodyType: str = "HTML"

@router.post("/send")
async def send_email(req: SendRequest):
    try:
        await asyncio.get_event_loop().run_in_executor(
            None, lambda: smtp_send(req.to, req.subject, req.body)
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ReplyRequest(BaseModel):
    body: str
    bodyType: str = "HTML"

@router.post("/{message_id}/reply")
async def reply_to_message(message_id: str, req: ReplyRequest):
    original = next((m for m in _load_cache() if m["id"] == message_id), None)
    if not original:
        raise HTTPException(status_code=404, detail="Message not found in cache")

    subject = original["subject"]
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"

    try:
        await asyncio.get_event_loop().run_in_executor(
            None, lambda: smtp_send(original["fromAddress"], subject, req.body, reply_to_id=message_id)
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sync")
async def trigger_sync():
    if not _is_configured():
        raise HTTPException(status_code=400, detail="Email credentials not set in config.json")
    try:
        count = await asyncio.get_event_loop().run_in_executor(None, sync_pop3)
        return {"ok": True, "new_messages": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
