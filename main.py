import asyncio
import hashlib
import json
import secrets
import subprocess
import time
import urllib.request
from pathlib import Path
from contextlib import asynccontextmanager
from typing import List

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse, RedirectResponse
from fastapi.exceptions import HTTPException

from config import get_vault_path, get_port, load_config
from routers import projects, ideas, inbox, backlog, goals, attention, organize, chat, oauth, ms_tasks
from routers import webhook_email, planner_webhook
from routers.chat import init_session, close_session

STATIC_DIR = Path(__file__).parent / "static"
FRONTEND_INDEX = STATIC_DIR / "index.html"

# ── WebSocket connection manager ────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, message: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active.remove(ws)

manager = ConnectionManager()

# ── Auth ─────────────────────────────────────────────────────────────────────

def _get_password() -> str:
    config = load_config()
    auth = config.get("ngrok_auth", "")
    if ":" in auth:
        return auth.split(":", 1)[1]
    return auth

def _make_session_token() -> str:
    """Stable token derived from password — survives server restarts."""
    return hashlib.sha256(f"mycockpit:{_get_password()}".encode()).hexdigest()

def _is_local(request: Request) -> bool:
    host = request.headers.get("host", "")
    return host.startswith("localhost") or host.startswith("127.")

LOGIN_HTML = """<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MyCockpit — Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0F0F11; color: #F0F0F4; font-family: Inter, system-ui, sans-serif;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #18181C; border: 1px solid #2E2E38; border-radius: 16px;
            padding: 40px; width: 100%; max-width: 360px; }
    h1 { font-size: 22px; margin-bottom: 8px; }
    p { color: #9090A0; font-size: 13px; margin-bottom: 28px; }
    input { width: 100%; background: #222228; border: 1px solid #2E2E38; border-radius: 8px;
            color: #F0F0F4; font-size: 15px; padding: 12px 14px; margin-bottom: 14px; outline: none; }
    input:focus { border-color: #4A8FFF; }
    button { width: 100%; background: #4A8FFF; color: #fff; border: none; border-radius: 8px;
             font-size: 15px; font-weight: 600; padding: 13px; cursor: pointer; }
    .error { color: #FF5C5C; font-size: 13px; margin-top: 12px; text-align: center; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>MyCockpit</h1>
    <p>Enter your password to continue.</p>
    <input type="password" id="pw" placeholder="Password" autofocus autocomplete="current-password">
    <button onclick="doLogin()">Enter</button>
    <p class="error" id="err">Incorrect password. Try again.</p>
  </div>
  <script>
    // Check if already logged in
    var token = localStorage.getItem('dd_token');
    if (token) {
      fetch('/api/health', { headers: { 'X-Session-Token': token } })
        .then(function(r) { if (r.ok) window.location.href = '/'; });
    }
    document.getElementById('pw').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doLogin();
    });
    function doLogin() {
      var pw = document.getElementById('pw').value;
      fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      }).then(function(r) {
        return r.json().then(function(data) {
          if (r.ok) {
            localStorage.setItem('dd_token', data.token);
            window.location.href = '/';
          } else {
            document.getElementById('err').style.display = 'block';
            document.getElementById('pw').value = '';
            document.getElementById('pw').focus();
          }
        });
      });
    }
  </script>
</body>
</html>"""

# ── ngrok tunnel + QR ────────────────────────────────────────────────────────

_ngrok_proc = None

def _find_ngrok() -> str:
    """Resolve ngrok executable — handles winget install on Windows."""
    import shutil
    # Check winget packages directory (Windows)
    winget_base = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
    if winget_base.exists():
        for p in sorted(winget_base.glob("Ngrok.Ngrok_*/ngrok.exe")):
            return str(p)
    return shutil.which("ngrok") or "ngrok"

def _print_qr(url: str, label: str):
    try:
        import qrcode as _qr
        qr = _qr.QRCode(border=2)
        qr.add_data(url)
        qr.make(fit=True)
        print(f"  -- {label} --")
        print("")
        qr.print_ascii(invert=True)
        print("")
    except ImportError:
        pass

def _get_local_ip() -> str:
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "unknown"

def start_ngrok(port: int):
    global _ngrok_proc
    local_ip = _get_local_ip()
    network_url = f"http://{local_ip}:{port}"
    ngrok_url = None
    ngrok_cmd = _find_ngrok()

    # Auto-configure authtoken from config if present
    config = load_config()
    ngrok_token = config.get("ngrok_token", "").strip()
    if ngrok_token:
        try:
            subprocess.run([ngrok_cmd, "config", "add-authtoken", ngrok_token],
                           capture_output=True, timeout=10)
        except Exception:
            pass

    try:
        _ngrok_proc = subprocess.Popen(
            [ngrok_cmd, "http", f"127.0.0.1:{port}", "--log=stdout", "--log-level=warn"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        print("  Waiting for ngrok tunnel...", end="", flush=True)
        for _ in range(6):
            time.sleep(2)
            print(".", end="", flush=True)
            try:
                with urllib.request.urlopen("http://localhost:4040/api/tunnels", timeout=3) as r:
                    data = json.loads(r.read())
                tunnels = data.get("tunnels", [])
                if tunnels:
                    for t in tunnels:
                        if t.get("proto") == "https":
                            ngrok_url = t["public_url"]
                            break
                    if not ngrok_url:
                        ngrok_url = tunnels[0]["public_url"]
                    break
            except Exception:
                continue
        print("")
    except FileNotFoundError:
        pass  # ngrok not installed

    print("")
    print("  MyCockpit -- Dust Photonics")
    print("  " + "=" * 42)
    print("")
    print(f"  Desktop  ->  http://localhost:{port}")
    print(f"  Wi-Fi    ->  {network_url}")
    if ngrok_url:
        print(f"  Public   ->  {ngrok_url}  <- anywhere!")
    else:
        print(f"  Public   ->  (ngrok not running -- install to access from anywhere)")
    print(f"  API docs ->  http://localhost:{port}/docs")
    print("")

    if ngrok_url:
        _print_qr(ngrok_url, "Public URL - scan from anywhere")
    else:
        _print_qr(network_url, "Wi-Fi URL - scan on same network")

# ── File watcher ─────────────────────────────────────────────────────────────

async def watch_vault():
    try:
        from watchfiles import awatch
        vault = get_vault_path()
        async for changes in awatch(vault, recursive=True):
            for _, path in changes:
                if path.endswith(".md") or path.endswith(".json"):
                    await manager.broadcast({"type": "file_changed", "path": path})
    except Exception as e:
        print(f"[watcher] error: {e}")

# ── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    watcher_task = asyncio.create_task(watch_vault())
    asyncio.create_task(init_session())   # warm up Claude session in background
    yield
    watcher_task.cancel()
    await close_session()
    if _ngrok_proc:
        _ngrok_proc.terminate()

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="MyCockpit", version="1.0.0", lifespan=lifespan)

# ── Auth middleware ───────────────────────────────────────────────────────────

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    # Only protect API endpoints — let pages and assets load freely
    if not (path.startswith("/api") or path.startswith("/ws")):
        return await call_next(request)
    # Local access always allowed
    if _is_local(request):
        return await call_next(request)
    # Allow login endpoint itself
    if path == "/login":
        return await call_next(request)
    # Check session token from header
    token = request.headers.get("X-Session-Token", "")
    if token == _make_session_token():
        return await call_next(request)
    return JSONResponse({"detail": "Unauthorized"}, status_code=401)

@app.get("/login", response_class=HTMLResponse)
def login_page():
    return HTMLResponse(LOGIN_HTML)

@app.post("/login")
async def login_submit(request: Request):
    body = await request.json()
    password = body.get("password", "")
    if password == _get_password():
        return JSONResponse({"token": _make_session_token()})
    return JSONResponse({"detail": "Incorrect password"}, status_code=401)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(projects.router)
app.include_router(ideas.router)
app.include_router(inbox.router)
app.include_router(backlog.router)
app.include_router(goals.router)
app.include_router(attention.router)
app.include_router(organize.router)
app.include_router(chat.router)
app.include_router(oauth.router)
app.include_router(webhook_email.router)
app.include_router(ms_tasks.router)
app.include_router(planner_webhook.router)

# ── API routes ────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    vault = get_vault_path()
    config = load_config()
    md_files = list(vault.rglob("*.md"))
    project_files = list((vault / "01_Projects").glob("*.md")) if (vault / "01_Projects").exists() else []
    return {
        "status": "ok",
        "vault_path": str(vault),
        "vault_exists": vault.exists(),
        "ai_enabled": config.get("ai_enabled", False),
        "version": config.get("version", "1.0.0"),
        "stats": {
            "markdown_files": len(md_files),
            "projects": len(project_files),
        },
    }

# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)

# ── Static files ─────────────────────────────────────────────────────────────

if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

# ── SPA fallback — serve index.html for all non-API 404s ─────────────────────

@app.exception_handler(404)
async def spa_fallback(request: Request, exc: HTTPException):
    path = request.url.path
    if path.startswith("/api") or path.startswith("/ws"):
        return JSONResponse({"detail": "Not found"}, status_code=404)
    if STATIC_DIR.exists():
        return FileResponse(FRONTEND_INDEX)
    return JSONResponse(
        {"message": "MyCockpit API running.", "docs": "/docs"},
        status_code=200,
    )

@app.get("/")
def root():
    if STATIC_DIR.exists():
        return FileResponse(FRONTEND_INDEX)
    return {"message": "MyCockpit API running.", "docs": "/docs"}

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    port = get_port()
    script_dir = str(Path(__file__).parent)
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    print(f"  Vault  ->  {get_vault_path()}")
    start_ngrok(port)
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)
