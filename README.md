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

## Power Automate integrations — all 6 flows

MyCockpit connects bidirectionally to Outlook and Microsoft Planner via Power Automate. Six flows cover every read, write, and reaction between your cockpit, your email, and your team's tasks.

### Getting your session token (needed for all inbound flows)

1. Start MyCockpit and open it via its public ngrok URL (not localhost)
2. Log in with your password
3. Open browser DevTools → Application → Local Storage → copy the value of `dd_token`

> The token is stable across restarts — derived from your password, so you only need to fetch it once.

---

### Flow 1 — Outlook → MyCockpit (receive & filter emails)

**Direction:** Inbound
**Trigger:** New email arrives in your Outlook inbox
**Result:** Actionable emails are auto-captured to `inbox.md`; noise is silently dropped

MyCockpit scores every email before capturing it:
- **Always captures** — emails flagged `importance: high`
- **Captures** — emails with action signals (deadlines, review requests, approvals, follow-ups)
- **Drops silently** — newsletters, noreply senders, FYI-only, automated messages

**Endpoint:** `POST /api/email`

```json
{
  "sender":     "John Smith <john@example.com>",
  "subject":    "Please review the budget proposal",
  "body":       "<html>...</html> or plain text",
  "importance": "high" | "normal" | "low"
}
```

**Power Automate setup:**

| | |
|---|---|
| Trigger | `When a new email arrives (V3)` — Microsoft 365 Outlook |
| Folder | Inbox |
| Action | HTTP POST to `https://YOUR-NGROK-URL/api/email` |
| Headers | `Content-Type: application/json` + `X-Session-Token: YOUR_TOKEN` |

Body (dynamic content):
```json
{
  "sender":     "@{triggerOutputs()?['body/from']}",
  "subject":    "@{triggerOutputs()?['body/subject']}",
  "body":       "@{triggerOutputs()?['body/body/content']}",
  "importance": "@{triggerOutputs()?['body/importance']}"
}
```

---

### Flow 2 — MyCockpit → Outlook (send email)

**Direction:** Outbound
**Trigger:** Call `POST /api/email/send` from MyCockpit (or Claude chat)
**Result:** Power Automate sends the email from your Outlook account

**Setup in `config.json`:**
```json
{ "email_send_webhook": "https://prod-xx.westus.logic.azure.com/workflows/..." }
```

**Endpoint:** `POST /api/email/send`

```json
{
  "to":         "alice@company.com",
  "subject":    "Update on the project",
  "body":       "Hi Alice, ...",
  "importance": "normal"
}
```

**Power Automate flow to create:**

| | |
|---|---|
| Trigger | `When an HTTP request is received` (Request connector) |
| Action 1 | `Send an email (V2)` — Microsoft 365 Outlook |

Action 1 fields:
```
To:         @{triggerBody()?['to']}
Subject:    @{triggerBody()?['subject']}
Body:       @{triggerBody()?['body']}
Importance: @{triggerBody()?['importance']}
```

Copy the generated HTTP POST URL and paste it into `email_send_webhook` in `config.json`.

---

### Flow 3 — Planner → MyCockpit (new task created)

**Direction:** Inbound
**Trigger:** A new task is created in a Microsoft Planner plan you belong to
**Result:** Task is captured to `inbox.md` for review

**Endpoint:** `POST /api/planner/task`

```json
{
  "title":      "Review vendor contract",
  "plan_name":  "Q2 Projects",
  "bucket":     "Legal",
  "due_date":   "2026-04-01",
  "priority":   "important"
}
```

**Power Automate setup:**

| | |
|---|---|
| Trigger | `When a task is created` — Microsoft Planner |
| Plan ID | your plan |
| Action | HTTP POST to `https://YOUR-NGROK-URL/api/planner/task` |
| Headers | `Content-Type: application/json` + `X-Session-Token: YOUR_TOKEN` |

Body:
```json
{
  "title":     "@{triggerOutputs()?['body/title']}",
  "plan_name": "@{triggerOutputs()?['body/planId']}",
  "bucket":    "@{triggerOutputs()?['body/bucketId']}",
  "due_date":  "@{triggerOutputs()?['body/dueDateTime']}",
  "priority":  "@{triggerOutputs()?['body/priority']}"
}
```

---

### Flow 4 — MyCockpit → Planner (new backlog task creates Planner task)

**Direction:** Outbound
**Trigger:** Any task added to `master_backlog.md` via `POST /api/backlog`
**Result:** Power Automate automatically creates the matching task in Planner

**Setup in `config.json`:**
```json
{ "planner_create_webhook": "https://prod-xx.westus.logic.azure.com/workflows/..." }
```

No extra API call needed — this fires automatically whenever you add a task to your backlog.

**Power Automate flow to create:**

| | |
|---|---|
| Trigger | `When an HTTP request is received` (Request connector) |
| Action 1 | `Create a task` — Microsoft Planner |

Action 1 fields:
```
Plan ID:     <your plan>
Title:       @{triggerBody()?['title']}
Bucket ID:   <your default bucket>  (or map from triggerBody()?['bucket'])
Assigned to: @{triggerBody()?['assigned_to']}
```

Copy the generated HTTP POST URL and paste it into `planner_create_webhook` in `config.json`.

---

### Flow 5 — Planner update → MyCockpit (sync task completion)

**Direction:** Inbound
**Trigger:** A task in Planner is completed or its status changes
**Result:** Matching task in `master_backlog.md` is updated; if not found, a note is captured to inbox

**Endpoint:** `POST /api/planner/update`

```json
{
  "title":      "Review vendor contract",
  "new_status": "completed",
  "completed_by": "Alice",
  "plan_name":  "Q2 Projects"
}
```

Valid values for `new_status`: `completed` · `in progress` · `not started` · `deferred` · `waiting on someone else`

**Power Automate setup:**

| | |
|---|---|
| Trigger | `When a task is completed` — Microsoft Planner |
| Action | HTTP POST to `https://YOUR-NGROK-URL/api/planner/update` |
| Headers | `Content-Type: application/json` + `X-Session-Token: YOUR_TOKEN` |

Body:
```json
{
  "title":        "@{triggerOutputs()?['body/title']}",
  "new_status":   "completed",
  "completed_by": "@{triggerOutputs()?['body/completedBy/user/displayName']}",
  "plan_name":    "@{triggerOutputs()?['body/planId']}"
}
```

> For status changes (not just completion), use the `When a task is updated` trigger and pass `@{triggerOutputs()?['body/percentComplete']}` mapped to the appropriate status string.

---

### Flow 6 — Team member assigns task → MyCockpit alert

**Direction:** Inbound
**Trigger:** A teammate creates a task in Planner and assigns it to you
**Result:** Task appears in `inbox.md` with the assignee's name as source

**Endpoint:** `POST /api/planner/task` (same endpoint as Flow 3, with `assigned_by` set)

```json
{
  "title":       "Prepare demo for client",
  "assigned_by": "Sarah",
  "plan_name":   "Sales",
  "due_date":    "2026-03-28"
}
```

The inbox entry will read: `Task from Sarah [Sales]: Prepare demo for client [due:: 2026-03-28]`

**Power Automate setup:**

| | |
|---|---|
| Trigger | `When a task is assigned to me` — Microsoft Planner |
| Action | HTTP POST to `https://YOUR-NGROK-URL/api/planner/task` |
| Headers | `Content-Type: application/json` + `X-Session-Token: YOUR_TOKEN` |

Body:
```json
{
  "title":       "@{triggerOutputs()?['body/title']}",
  "assigned_by": "@{triggerOutputs()?['body/createdBy/user/displayName']}",
  "plan_name":   "@{triggerOutputs()?['body/planId']}",
  "due_date":    "@{triggerOutputs()?['body/dueDateTime']}",
  "priority":    "@{triggerOutputs()?['body/priority']}"
}
```

---

### Config.json — all integration fields

```json
{
  "email_send_webhook":    "https://...",  // Flow 2 — Power Automate HTTP trigger URL for sending email
  "planner_create_webhook": "https://..."  // Flow 4 — Power Automate HTTP trigger URL for creating Planner task
}
```

Flows 1, 3, 5, and 6 are inbound — no config needed, just set up the Power Automate flows to POST to your ngrok URL.

---

### Relevant files

| File | Purpose |
|---|---|
| `routers/email.py` | Flows 1 & 2 — receive emails, send emails via webhook |
| `routers/planner.py` | Flows 3, 5 & 6 — receive Planner tasks and updates |
| `routers/backlog.py` | Flow 4 — outbound Planner push on task creation |
| `routers/inbox.py` | Inbox capture + review (classifies TASK vs IDEA, files to backlog or ideas) |
| `main.py` | Registers all routers; auth middleware; ngrok startup |
| `config.json` | `email_send_webhook`, `planner_create_webhook`, `ngrok_token`, `ngrok_auth` |

---

## Tech stack

- **Backend** — FastAPI (Python), port 7844
- **Frontend** — React + TypeScript + Zustand + Tailwind CSS, built with Vite
- **AI** — Claude via `claude` CLI subprocess (`--output-format stream-json`)
- **Storage** — plain markdown files, no database
