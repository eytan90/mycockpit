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

## Tech stack

- **Backend** — FastAPI (Python), port 7844
- **Frontend** — React + TypeScript + Zustand + Tailwind CSS, built with Vite
- **AI** — Claude via `claude` CLI subprocess (`--output-format stream-json`)
- **Storage** — plain markdown files, no database
