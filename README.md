# MyCockpit

A personal executive operating system — local-first, AI-powered, runs entirely on your machine.

Built for people who live in markdown vaults and want a single cockpit to manage projects, tasks, ideas, and goals — with Claude as an embedded chief of staff.

---

## What it does

- **Home** — command center with stats, quick capture, smart mode suggestions
- **Focus** — signal-driven task view (overdue, in-progress, high-priority, up next)
- **Projects** — full project management with milestones, progress, next actions, blockers
- **Plan** — goals by horizon linked to projects, plus vault health signals
- **Ideas** — maturity kanban (Needs Refinement → Long-term → Needs Scoping → Ready to Promote)
- **Claude** — embedded AI chat with full vault context, file/image attachments, camera support

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.11+ | [python.org](https://python.org) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| Claude Code | latest | [claude.ai/code](https://claude.ai/code) — needed for embedded chat |

> The embedded Claude chat uses your existing **Claude Code** login — no API key needed.

---

## Quick start

### 1. Clone

```bash
git clone https://github.com/eytanperez/mycockpit.git
cd mycockpit
```

### 2. Configure

```bash
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "vault_path": "../",        // relative path from this folder to your markdown vault
  "port": 7844,
  "ai_enabled": true,
  "theme": "dark",
  "ngrok_auth": "user:password"  // optional — for remote access from phone/outside network
}
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Build the frontend

```bash
cd frontend
npm install
npm run build
cd ..
```

### 5. Run

**Windows** — double-click `Start MyCockpit.bat` (handles everything automatically)

**Manual:**
```bash
python main.py
```

Open [http://localhost:7844](http://localhost:7844)

---

## Getting started with your vault

A ready-to-use vault template is included in [`vault-template/`](./vault-template). Copy it anywhere on your machine and point `vault_path` in `config.json` to it:

```bash
cp -r vault-template ~/my-vault
```

Then set in `config.json`:
```json
{ "vault_path": "../../my-vault" }
```

---

## Vault structure

MyCockpit expects your vault to follow this folder layout:

```
vault/
├── CLAUDE.md                  ← workspace instructions for the embedded Claude
├── master_backlog.md          ← single source of truth for all tasks
├── 00_Dashboard/
│   ├── inbox.md               ← quick capture log
│   ├── ideas.md               ← ideas with maturity scoring
│   └── goals.md               ← goals by horizon
├── 01_Projects/               ← one .md file per project (YAML frontmatter)
├── 02_Research/
├── 03_Team/
├── 04_Processes/
├── 06_Docs_and_Reports/
└── 07_Templates/
```

### Project file format (`01_Projects/my_project.md`)

```yaml
---
name: My Project
status: in-progress
priority: high
progress: 40
owner: Eytan
target_date: 2026-06-01
next_action: Write test plan
blockers: Waiting on hardware
confidence: high
---

## Milestones
- [x] Define scope
- [ ] Build prototype
- [ ] Run validation tests
```

### Ideas maturity scoring (`00_Dashboard/ideas.md`)

```
- My idea title [area:: Engineering] [effort:: low] [from:: weekly review]
```

| effort | metadata complete | maturity |
|---|---|---|
| low | ✓ | 90 — Ready to promote |
| med | ✓ | 60 — Needs scoping |
| high | ✓ | 30 — Long-term |
| any | missing fields | 10 — Needs refinement |

Ideas at 90 maturity can be promoted directly to `master_backlog.md` from the Ideas tab.

---

## Remote access (optional)

Install [ngrok](https://ngrok.com), add your auth token once:

```bash
ngrok config add-authtoken YOUR_TOKEN
```

Set `ngrok_auth` in `config.json`. MyCockpit will auto-start the tunnel on launch and print a QR code for your phone.

---

## Email → Inbox integration (Power Automate)

MyCockpit exposes a webhook at `POST /api/email` that Power Automate (or any HTTP client) can call when an email arrives. It auto-scores the email for actionability and captures it to your inbox if it warrants attention.

### How it works

1. Power Automate triggers on a new email in Outlook
2. It POSTs structured email data to `/api/email`
3. MyCockpit scores the email:
   - **Always captures** — `importance: "high"` emails
   - **Captures** — emails with action signals (deadlines, requests, approvals, follow-ups)
   - **Drops silently** — newsletters, noreply senders, FYI-only, automated messages
4. Captured emails land in `vault/00_Dashboard/inbox.md` as unreviewed items
5. From there, `/api/inbox/review` (or the Inbox tab) classifies them as TASK or IDEA and files them

### Endpoint

```
POST /api/email
Content-Type: application/json
X-Session-Token: <your session token>

{
  "sender":     "John Smith <john@example.com>",
  "subject":    "Please review the budget proposal",
  "body":       "<html>...</html> or plain text",
  "importance": "high" | "normal" | "low"
}
```

**Response:**
```json
{ "captured": true, "reason": "action pattern matched", "entry": "Email from John Smith: Please review the budget proposal" }
```
or
```json
{ "captured": false, "reason": "noise/automated" }
```

### Getting your session token

1. Start MyCockpit and open it via its public ngrok URL (not localhost)
2. Log in with your password
3. Open browser DevTools → Application → Local Storage → copy the value of `dd_token`

> The token is stable across restarts — it's derived from your password, so you only need to fetch it once.

### Power Automate flow — step by step

**Trigger:** `When a new email arrives (V3)` — Microsoft 365 Outlook connector

| Setting | Value |
|---|---|
| Folder | Inbox |
| Importance | All (let the endpoint decide) or `High` if you want to pre-filter |
| Include Attachments | No |

**Action:** `HTTP`

| Field | Value |
|---|---|
| Method | `POST` |
| URI | `https://YOUR-NGROK-URL/api/email` |
| Headers | `Content-Type: application/json` + `X-Session-Token: YOUR_TOKEN` |
| Body | see below |

**Body** (use Power Automate dynamic content):
```json
{
  "sender":     "@{triggerOutputs()?['body/from']}",
  "subject":    "@{triggerOutputs()?['body/subject']}",
  "body":       "@{triggerOutputs()?['body/body/content']}",
  "importance": "@{triggerOutputs()?['body/importance']}"
}
```

**Optional — add a Condition after the HTTP action** to only notify you when `captured` is `false` (so you can manually decide), using the expression:
```
body('HTTP')?['captured']
```

### Relevant files

| File | Purpose |
|---|---|
| `routers/email.py` | Webhook endpoint — scoring logic, inbox append |
| `routers/inbox.py` | Inbox capture + review (classifies TASK vs IDEA, files to backlog or ideas) |
| `main.py` | Registers all routers; handles auth middleware and ngrok startup |
| `config.json` | `ngrok_token` — authtoken auto-configured on startup; `ngrok_auth` — `user:password` for remote login |

---

## Tech stack

- **Backend** — FastAPI (Python), port 7844
- **Frontend** — React + TypeScript + Zustand + Tailwind CSS, built with Vite
- **AI** — Claude via `claude` CLI subprocess (`--output-format stream-json`)
- **Storage** — plain markdown files, no database
