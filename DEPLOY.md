# MyCockpit — Server Deployment Guide

## What this is

MyCockpit is a FastAPI + React personal OS running on port 7844.
- Backend: Python (FastAPI + uvicorn)
- Frontend: React/Vite (pre-built into `static/`)
- AI chat: uses `claude` CLI subprocess (Claude Code must be installed and authenticated)
- Storage: plain markdown files (no database)
- Two repos:
  - App code: https://github.com/eytan90/mycockpit (public)
  - Personal vault: https://github.com/eytan90/dustphotonics-vault (private)

---

## Prerequisites

```bash
# Python 3.11+
python3 --version

# Node.js 18+ (only needed to build frontend)
node --version

# Claude Code (for embedded chat)
curl -fsSL https://claude.ai/install.sh | sh
claude auth login
```

---

## Step 1 — Clone both repos

```bash
# Pick a base directory
mkdir ~/mycockpit && cd ~/mycockpit

# Clone the app
git clone https://github.com/eytan90/mycockpit app

# Clone the vault (private — needs GitHub auth)
git clone https://github.com/eytan90/dustphotonics-vault vault
```

---

## Step 2 — Configure

```bash
cp app/config.example.json app/config.json
```

Edit `app/config.json`:
```json
{
  "vault_path": "../vault",
  "port": 7844,
  "ai_enabled": true,
  "theme": "dark",
  "version": "1.6.1",
  "ngrok_auth": "eytan:tatoune1990"
}
```

> `vault_path` is relative to the `app/` folder — `../vault` points to the vault repo cloned above.

---

## Step 3 — Install Python dependencies

```bash
cd ~/mycockpit/app
pip install -r requirements.txt
```

---

## Step 4 — Build the frontend

```bash
cd ~/mycockpit/app/frontend
npm install
npm run build
cd ..
```

This outputs the built app into `static/` which FastAPI serves automatically.

---

## Step 5 — Run

```bash
cd ~/mycockpit/app
python main.py
```

Access at: http://localhost:7844 (or server IP:7844)

---

## Step 6 — Run permanently (Linux systemd)

Create a service so it starts on boot and restarts on crash:

```bash
sudo nano /etc/systemd/system/mycockpit.service
```

Paste:
```ini
[Unit]
Description=MyCockpit
After=network.target

[Service]
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/mycockpit/app
ExecStart=/usr/bin/python3 main.py
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable mycockpit
sudo systemctl start mycockpit
sudo systemctl status mycockpit
```

---

## Step 7 — Keep vault in sync

To pull latest vault changes on the server:
```bash
cd ~/mycockpit/vault && git pull
```

To push changes made via MyCockpit (the app edits vault files directly):
```bash
cd ~/mycockpit/vault
git add -A
git commit -m "vault sync $(date +%Y-%m-%d)"
git push
```

Or set up a cron job to auto-push every hour:
```bash
crontab -e
# Add:
0 * * * * cd ~/mycockpit/vault && git add -A && git commit -m "auto sync" && git push
```

---

## Context for a new Claude session

If starting a fresh Claude CLI session on the server, paste this as the first message:

> "I'm setting up MyCockpit on this server. MyCockpit is a FastAPI+React personal OS at ~/mycockpit/app, vault is at ~/mycockpit/vault. The app is already running via systemd on port 7844. The embedded Claude chat uses the `claude` CLI subprocess with `--output-format stream-json --verbose --dangerously-skip-permissions`. Config is at ~/mycockpit/app/config.json. The vault has CLAUDE.md with workspace instructions. Help me with [your task]."

---

## Architecture notes (for Claude)

- `config.py` — looks for `config.json` locally first, then falls back to `../../08_Dream/config.json`
- `routers/chat.py` — Claude chat uses CLI subprocess, session continuity via `--resume <session_id>`
- `main.py` — FastAPI app, lifespan starts file watcher + warms up Claude session on boot
- `static/` — built frontend (gitignored), served by FastAPI
- No API keys needed — Claude Code login is sufficient
