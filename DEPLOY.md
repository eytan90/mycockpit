# MyCockpit — Deployment Guide

## Quick Start (Windows — recommended)

### Prerequisites (one-time installs)

Install these before running setup:

| Tool | Install | Notes |
|------|---------|-------|
| Python 3.11+ | [python.org/downloads](https://www.python.org/downloads/) | Check "Add Python to PATH" |
| Node.js 18+ | [nodejs.org](https://nodejs.org/) | LTS version |
| git | [git-scm.com](https://git-scm.com/) | |
| Claude Code | `npm install -g @anthropic-ai/claude-code` then `claude auth login` | Required for AI chat |

### Run setup

```
Double-click setup.bat
```

That's it. The script will:
1. Verify prerequisites
2. Clone the app repo and private vault repo (asks for GitHub token)
3. Create `config.json` — asks for port, username, password, ngrok token
4. Install Python dependencies
5. Build the frontend
6. Install + update ngrok, configure authtoken
7. Optionally register Windows Task Scheduler for auto-start on login
8. Launch the app

### Getting your ngrok authtoken

1. Sign up free at [ngrok.com](https://ngrok.com)
2. Go to **dashboard.ngrok.com/get-started/your-authtoken** (left sidebar)
3. Copy the token — it starts with a long number like `2abc123XYZ...`

---

## Manual Setup

If you prefer to run each step yourself:

### 1 — Clone both repos

```bash
mkdir ~/mycockpit && cd ~/mycockpit
git clone https://github.com/eytan90/mycockpit app
git clone https://YOUR_GITHUB_TOKEN@github.com/eytan90/dustphotonics-vault.git vault
```

### 2 — Configure

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
  "ngrok_auth": "your_username:your_password",
  "ngrok_token": "your_ngrok_authtoken"
}
```

> `ngrok_auth` sets the login credentials for remote access.
> `ngrok_token` is your ngrok authtoken — the app will configure and start ngrok automatically.

### 3 — Install Python deps

```bash
pip install -r app/requirements.txt
```

### 4 — Build frontend

```bash
cd app/frontend && npm install && npm run build
```

### 5 — Run

**Windows:**
```
Double-click run.bat
```

**Terminal:**
```bash
cd ~/mycockpit/app && python main.py
```

`run.bat` kills any existing instance on port 7844 before starting, avoiding port conflicts on restart.

---

## Running permanently

### Windows — Task Scheduler (recommended)

`setup.bat` can register this automatically (step 7 of setup). To do it manually:

```
schtasks /Create /TN "MyCockpit" /TR "C:\Users\YOU\mycockpit\app\run.bat" /SC ONLOGON /RL HIGHEST /F
```

### Linux — systemd

```bash
sudo nano /etc/systemd/system/mycockpit.service
```

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

```bash
sudo systemctl daemon-reload
sudo systemctl enable mycockpit
sudo systemctl start mycockpit
```

---

## Keeping the vault in sync

```bash
# Push local changes to GitHub
cd ~/mycockpit/vault
git add -A && git commit -m "vault sync" && git push

# Pull changes from GitHub
cd ~/mycockpit/vault && git pull
```

Auto-push every hour (Linux cron):
```bash
crontab -e
# Add:
0 * * * * cd ~/mycockpit/vault && git add -A && git diff --cached --quiet || git commit -m "auto sync $(date +\%Y-\%m-\%d\ \%H:\%M)" && git push
```

---

## Architecture notes

- `config.py` — loads `config.json` from app dir
- `routers/chat.py` — Claude AI chat via `claude` CLI subprocess; uses `claude.cmd` on Windows
- `main.py` — FastAPI app; starts ngrok automatically if `ngrok_token` is set in config; session tokens are stable across restarts (derived from password)
- `static/` — built frontend (gitignored), served by FastAPI
- No API keys needed — Claude Code login (`claude auth login`) is sufficient

---

## Context for a new Claude session

```
I'm setting up MyCockpit on this machine. MyCockpit is a FastAPI+React personal OS at
~/mycockpit/app, vault is at ~/mycockpit/vault. The app runs on port 7844. The embedded
Claude chat uses the `claude` CLI subprocess with --output-format stream-json --verbose
--dangerously-skip-permissions. Config is at ~/mycockpit/app/config.json. The vault has
CLAUDE.md with workspace instructions.
```
