import json
import re
import urllib.request
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import get_vault_path, load_config
from parsers.frontmatter import read_file, write_file

router = APIRouter(prefix="/api/email", tags=["email"])

# Patterns that suggest an email needs action from you
ACTION_PATTERNS = [
    r'\bplease\b.{0,60}\b(review|approve|confirm|check|send|update|schedule|complete|sign|submit)\b',
    r'\b(can you|could you|would you|do you|please)\b.{0,80}\?',
    r'\baction (required|needed|items?)\b',
    r'\b(deadline|due|by (eod|eow|monday|tuesday|wednesday|thursday|friday|today|tomorrow))\b',
    r'\b(urgent|asap|high priority|follow.?up)\b',
    r'\bwaiting (on|for) (you|your)\b',
    r'\byour (input|feedback|approval|response|review)\b',
]

# Noise signals — newsletters, automated messages, FYI-only
NOISE_PATTERNS = [
    r'\b(unsubscribe|subscription|newsletter|marketing|promo|deal|offer|discount)\b',
    r'\b(no.reply|noreply|donotreply|do.not.reply)\b',
    r'\b(automated|auto.generated|this is an automated)\b',
    r'\b(fyi|for your (information|awareness|records?))\b',
]


def _inbox_path():
    return get_vault_path() / "00_Dashboard" / "inbox.md"


def _strip_html(html: str) -> str:
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def _score_email(sender: str, subject: str, body_text: str) -> dict:
    """Return action_needed bool and a short rationale."""
    combined = f"{subject} {body_text}".lower()

    for pat in NOISE_PATTERNS:
        if re.search(pat, combined, re.IGNORECASE):
            return {"action_needed": False, "reason": "noise/automated"}

    for pat in ACTION_PATTERNS:
        if re.search(pat, combined, re.IGNORECASE):
            return {"action_needed": True, "reason": "action pattern matched"}

    return {"action_needed": False, "reason": "no action signals found"}


def _append_to_inbox(text: str) -> None:
    content = read_file(_inbox_path())
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    new_line = f"- [{ts}] {text}\n"
    marker = "<!-- Add new items below this line. One idea or task per line. Claude handles the rest. -->"
    if marker in content:
        content = content.replace(marker, marker + "\n" + new_line, 1)
    else:
        content = re.sub(r'(## ✏️ Unreviewed\n)', r'\g<1>' + new_line, content)
    write_file(_inbox_path(), content)


class EmailWebhook(BaseModel):
    sender: str
    subject: str
    body: Optional[str] = ""
    importance: Optional[str] = "normal"   # "high" | "normal" | "low"
    received_at: Optional[str] = ""


@router.post("")
def email_webhook(body: EmailWebhook):
    """
    Webhook endpoint for Power Automate.
    Accepts an email, decides if it needs action, and captures it to inbox.
    """
    sender = body.sender.strip()
    subject = body.subject.strip()
    if not subject:
        raise HTTPException(400, "subject is required")

    body_text = _strip_html(body.body or "")[:2000]  # cap at 2k chars for scoring

    # High-importance emails always get captured
    if body.importance and body.importance.lower() == "high":
        action_needed = True
        reason = "high importance flag"
    else:
        result = _score_email(sender, subject, body_text)
        action_needed = result["action_needed"]
        reason = result["reason"]

    if not action_needed:
        return {"captured": False, "reason": reason}

    # Build a concise inbox entry
    sender_name = sender.split("<")[0].strip() or sender
    entry = f"Email from {sender_name}: {subject}"
    _append_to_inbox(entry)

    return {"captured": True, "reason": reason, "entry": entry}


# ── Outbound: send email via Power Automate (Flow 2) ─────────────────────────

class SendEmailRequest(BaseModel):
    to: str
    subject: str
    body: str
    importance: Optional[str] = "normal"


@router.post("/send")
def send_email(body: SendEmailRequest):
    """
    Trigger Power Automate to send an email on your behalf.

    Requires 'email_send_webhook' in config.json — set it to the HTTP trigger URL
    of your Power Automate flow that sends emails.

    Power Automate flow setup:
      Trigger: "When an HTTP request is received" (manual trigger)
      Action:  "Send an email (V2)" — Microsoft 365 Outlook
        To:         @{triggerBody()?['to']}
        Subject:    @{triggerBody()?['subject']}
        Body:       @{triggerBody()?['body']}
        Importance: @{triggerBody()?['importance']}
    """
    to = body.to.strip()
    subject = body.subject.strip()
    if not to or not subject:
        raise HTTPException(400, "to and subject are required")

    config = load_config()
    webhook_url = config.get("email_send_webhook", "").strip()
    if not webhook_url:
        raise HTTPException(501, "email_send_webhook not configured in config.json")

    payload = {
        "to": to,
        "subject": subject,
        "body": body.body,
        "importance": body.importance or "normal",
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        webhook_url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        raise HTTPException(502, f"Failed to reach Power Automate webhook: {e}")

    return {"sent": True, "to": to, "subject": subject}
