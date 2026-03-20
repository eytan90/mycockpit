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

## Autonomous Design Critic

A self-improving UI/UX loop that detects and fixes design issues automatically, living in the `design-critic/` folder.

### How it works

The pipeline runs five stages in sequence:

| Stage | File | What it does |
|---|---|---|
| Observer | `observer.ts` | Playwright captures desktop (1440px) + mobile (390px) screenshots and a full DOM snapshot |
| Critic | `critic.ts` | `claude-opus-4-6` analyzes screenshots + DOM against the design constitution; returns structured issues and a 6-dimension score |
| Planner | `planner.ts` | Locates the exact source file for each issue and asks Claude for a minimal old→new patch |
| Editor | `editor.ts` | Applies patches with exact string replacement; backs up files so rollback is safe |
| Scorer | `scorer.ts` | Compares before/after screenshots with a weighted score (clarity 25%, consistency 20%, responsiveness 20%, accessibility 15%, vibe 20%, interaction 10%) |

The **orchestrator** wraps these into a loop with automatic rollback on score regression and an optional git commit on improvement.

### Setup

```bash
cd design-critic
npm install
npx playwright install chromium
```

### Usage

```bash
npm run report      # critique only — no edits, just a report
npm run semi-auto   # apply edits, pause for human review
npm run full-auto   # loop up to N iterations with auto rollback
```

CLI flags: `--mode`, `--url`, `--iterations`, `--protect`, `--threshold`

> No API key needed — all AI calls route through your existing **Claude Code** session via the `claude` CLI.

---

## Tech stack

- **Backend** — FastAPI (Python), port 7844
- **Frontend** — React + TypeScript + Zustand + Tailwind CSS, built with Vite
- **AI** — Claude via `claude` CLI subprocess (`--output-format stream-json`)
- **Storage** — plain markdown files, no database
- **Design Critic** — TypeScript + Playwright + `claude-opus-4-6` autonomous UI/UX loop
