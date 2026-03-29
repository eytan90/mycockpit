"""
Email router via Power Automate webhooks.

FLOW 1 — "Receive email" (set up in Power Automate):
  Trigger:  When a new email arrives (Office 365 Outlook)
  Action:   HTTP POST → https://<ngrok-url>/api/webhook/email
  Body:
  {
    "id":              "@{triggerOutputs()?['body/id']}",
    "from":            "@{triggerOutputs()?['body/from']}",
    "subject":         "@{triggerOutputs()?['body/subject']}",
    "body":            "@{triggerOutputs()?['body/body']}",
    "receivedDateTime":"@{triggerOutputs()?['body/receivedDateTime']}",
    "isRead":          "@{triggerOutputs()?['body/isRead']}",
    "hasAttachments":  "@{triggerOutputs()?['body/hasAttachments']}",
    "importance":      "@{triggerOutputs()?['body/importance']}",
    "toRecipients":    "@{triggerOutputs()?['body/toRecipients']}"
  }

FLOW 3 — "Send email" (set up in Power Automate):
  Trigger:  When an HTTP request is received (manual trigger)
  Action:   Send an email (V2) — map To/Subject/Body from trigger body
  → copy the generated HTTP POST URL into config.json as "pa_send_email_url"
"""

import asyncio
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import get_vault_path, load_config

router = APIRouter(tags=["email"])

# ── Config ─────────────────────────────────────────────────────────────────────

def _pa_send_url() -> str:
    return load_config().get("pa_send_email_url", "")

def _can_send() -> bool:
    return bool(_pa_send_url())

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

# ── Normalise PA email payload ─────────────────────────────────────────────────

def _parse_from(raw: str) -> tuple[str, str]:
    """'Name <addr>' or just 'addr' → (name, address)."""
    raw = (raw or "").strip()
    if "<" in raw:
        name = raw.split("<")[0].strip().strip('"')
        addr = raw.split("<")[1].rstrip(">").strip()
    else:
        name = raw
        addr = raw
    return name, addr

def _normalise(data: dict) -> dict:
    """Map Power Automate email fields to our internal format."""
    raw_from = data.get("from", "")
    from_name, from_addr = _parse_from(raw_from)

    subject = data.get("subject", "(no subject)") or "(no subject)"
    body = data.get("body", "") or ""
    # PA sometimes wraps body in HTML
    body_type = "html" if re.search(r"<[a-zA-Z]", body) else "text"
    preview = re.sub(r"<[^>]+>", "", body)[:200].replace("\n", " ").strip()

    # Stable ID
    msg_id = data.get("id") or hashlib.md5(
        f"{raw_from}{subject}{data.get('receivedDateTime','')}".encode()
    ).hexdigest()

    # To recipients — PA returns a string or list
    to_raw = data.get("toRecipients", "")
    to_list: list[dict] = []
    if isinstance(to_raw, list):
        for r in to_raw:
            n, a = _parse_from(r.get("emailAddress", {}).get("address", "") if isinstance(r, dict) else str(r))
            if a:
                to_list.append({"name": n, "address": a})
    elif isinstance(to_raw, str) and to_raw:
        for part in to_raw.split(";"):
            n, a = _parse_from(part.strip())
            if a:
                to_list.append({"name": n, "address": a})

    return {
        "id": msg_id,
        "from": from_name or from_addr,
        "fromAddress": from_addr,
        "to": to_list,
        "subject": subject,
        "preview": preview,
        "date": data.get("receivedDateTime", datetime.utcnow().isoformat()),
        "isRead": bool(data.get("isRead", False)),
        "hasAttachment": bool(data.get("hasAttachments", False)),
        "importance": data.get("importance", "normal") or "normal",
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

# ── Webhook receiver (Flow 1) ──────────────────────────────────────────────────

@router.post("/api/webhook/email")
async def receive_email(request: Request):
    """Power Automate posts new emails here."""
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Invalid JSON"}, status_code=400)

    items = data if isinstance(data, list) else [data]
    added = 0
    cache = _load_cache()
    existing_ids = {m["id"] for m in cache}

    for item in items:
        msg = _normalise(item)
        if msg["id"] not in existing_ids:
            cache.insert(0, msg)
            existing_ids.add(msg["id"])
            _write_to_vault(msg)
            added += 1

    if added:
        _save_cache(cache[:200])

    return {"ok": True, "added": added}

# ── Email API (used by frontend) ───────────────────────────────────────────────

@router.get("/api/email/status")
async def email_status():
    cache = _load_cache()
    has_emails = len(cache) > 0
    can_send = _can_send()
    return {
        "connected": has_emails or can_send,
        "account": load_config().get("email_user", "eytan.perez@dustphotonics.com"),
        "can_send": can_send,
        "email_count": len(cache),
    }

@router.get("/api/email/inbox")
async def list_inbox(top: int = 50, skip: int = 0):
    messages = _load_cache()
    page = messages[skip : skip + top]
    summaries = [{k: v for k, v in m.items() if k != "body"} for m in page]
    return {"messages": summaries, "total": len(messages)}

@router.get("/api/email/{message_id}")
async def get_message(message_id: str):
    for m in _load_cache():
        if m["id"] == message_id:
            return m
    raise HTTPException(status_code=404, detail="Message not found")

@router.post("/api/email/{message_id}/read")
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

@router.post("/api/email/send")
async def send_email(req: SendRequest):
    url = _pa_send_url()
    if not url:
        raise HTTPException(status_code=503, detail="pa_send_email_url not configured in config.json")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, json={"to": req.to, "subject": req.subject, "body": req.body})
        if not r.is_success:
            raise HTTPException(status_code=502, detail=f"Power Automate error: {r.text}")
        return {"ok": True}
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))

class ReplyRequest(BaseModel):
    body: str
    bodyType: str = "HTML"

@router.post("/api/email/{message_id}/reply")
async def reply_to_message(message_id: str, req: ReplyRequest):
    original = next((m for m in _load_cache() if m["id"] == message_id), None)
    if not original:
        raise HTTPException(status_code=404, detail="Message not found in cache")

    subject = original["subject"]
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"

    url = _pa_send_url()
    if not url:
        raise HTTPException(status_code=503, detail="pa_send_email_url not configured in config.json")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, json={
                "to": original["fromAddress"],
                "subject": subject,
                "body": req.body,
            })
        if not r.is_success:
            raise HTTPException(status_code=502, detail=f"Power Automate error: {r.text}")
        return {"ok": True}
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))
