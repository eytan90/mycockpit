from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from routers.oauth import get_access_token

router = APIRouter(prefix="/api/email", tags=["email"])

GRAPH = "https://graph.microsoft.com/v1.0"


async def _graph_get(path: str, params: dict | None = None) -> Any:
    token = await get_access_token()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(
            f"{GRAPH}{path}",
            headers={"Authorization": f"Bearer {token}"},
            params=params or {},
        )
    if r.status_code == 401:
        raise HTTPException(status_code=401, detail="Microsoft token expired — please reconnect")
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()


async def _graph_post(path: str, body: dict) -> Any:
    token = await get_access_token()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{GRAPH}{path}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=body,
        )
    if r.status_code == 401:
        raise HTTPException(status_code=401, detail="Microsoft token expired — please reconnect")
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json() if r.content else {}


async def _graph_patch(path: str, body: dict) -> Any:
    token = await get_access_token()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.patch(
            f"{GRAPH}{path}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=body,
        )
    if r.status_code == 401:
        raise HTTPException(status_code=401, detail="Microsoft token expired — please reconnect")
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json() if r.content else {}


# ── Inbox ──────────────────────────────────────────────────────────────────────

@router.get("/inbox")
async def list_inbox(top: int = 50, skip: int = 0):
    data = await _graph_get(
        "/me/mailFolders/inbox/messages",
        params={
            "$top": top,
            "$skip": skip,
            "$select": "id,from,subject,bodyPreview,receivedDateTime,isRead,hasAttachments,importance",
            "$orderby": "receivedDateTime desc",
        },
    )
    messages = []
    for m in data.get("value", []):
        sender = m.get("from", {}).get("emailAddress", {})
        messages.append({
            "id": m["id"],
            "from": sender.get("name", sender.get("address", "")),
            "fromAddress": sender.get("address", ""),
            "subject": m.get("subject", "(no subject)"),
            "preview": m.get("bodyPreview", ""),
            "date": m.get("receivedDateTime", ""),
            "isRead": m.get("isRead", True),
            "hasAttachment": m.get("hasAttachments", False),
            "importance": m.get("importance", "normal"),
        })
    return {"messages": messages, "total": len(messages)}


# ── Single message ─────────────────────────────────────────────────────────────

@router.get("/{message_id}")
async def get_message(message_id: str):
    data = await _graph_get(
        f"/me/messages/{message_id}",
        params={"$select": "id,from,toRecipients,subject,body,receivedDateTime,isRead,hasAttachments"},
    )
    sender = data.get("from", {}).get("emailAddress", {})
    to_list = [r.get("emailAddress", {}) for r in data.get("toRecipients", [])]
    return {
        "id": data["id"],
        "from": sender.get("name", sender.get("address", "")),
        "fromAddress": sender.get("address", ""),
        "to": [{"name": r.get("name", r.get("address", "")), "address": r.get("address", "")} for r in to_list],
        "subject": data.get("subject", "(no subject)"),
        "body": data.get("body", {}).get("content", ""),
        "bodyType": data.get("body", {}).get("contentType", "text"),
        "date": data.get("receivedDateTime", ""),
        "isRead": data.get("isRead", True),
        "hasAttachment": data.get("hasAttachments", False),
    }


# ── Mark as read ───────────────────────────────────────────────────────────────

@router.post("/{message_id}/read")
async def mark_read(message_id: str):
    await _graph_patch(f"/me/messages/{message_id}", {"isRead": True})
    return {"ok": True}


# ── Send ───────────────────────────────────────────────────────────────────────

class SendRequest(BaseModel):
    to: str
    subject: str
    body: str
    bodyType: str = "HTML"
    replyTo: str | None = None


@router.post("/send")
async def send_email(req: SendRequest):
    message: dict = {
        "subject": req.subject,
        "body": {"contentType": req.bodyType, "content": req.body},
        "toRecipients": [{"emailAddress": {"address": req.to}}],
    }
    if req.replyTo:
        message["replyTo"] = [{"emailAddress": {"address": req.replyTo}}]
    await _graph_post("/me/sendMail", {"message": message, "saveToSentItems": True})
    return {"ok": True}


# ── Reply ──────────────────────────────────────────────────────────────────────

class ReplyRequest(BaseModel):
    body: str
    bodyType: str = "HTML"


@router.post("/{message_id}/reply")
async def reply_to_message(message_id: str, req: ReplyRequest):
    await _graph_post(
        f"/me/messages/{message_id}/reply",
        {"message": {"body": {"contentType": req.bodyType, "content": req.body}}},
    )
    return {"ok": True}
