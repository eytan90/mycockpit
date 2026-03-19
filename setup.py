#!/usr/bin/env python3
"""
MyCockpit one-click setup for Windows.
Run via: setup.bat
"""
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path


# ── Helpers ───────────────────────────────────────────────────────────────────

def run(cmd, cwd=None, capture=False):
    return subprocess.run(cmd, shell=True, cwd=cwd,
                          capture_output=capture, text=True)

def ok(msg):   print(f"  [OK] {msg}")
def err(msg):  print(f"  [ERROR] {msg}")
def info(msg): print(f"  {msg}")
def ask(prompt, default=""):
    val = input(f"  {prompt}" + (f" [{default}]" if default else "") + ": ").strip()
    return val or default

def find_ngrok():
    winget_base = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
    if winget_base.exists():
        for p in sorted(winget_base.glob("Ngrok.Ngrok_*/ngrok.exe")):
            return str(p)
    return shutil.which("ngrok")

def find_claude():
    npm_bin = Path.home() / "AppData" / "Roaming" / "npm"
    for name in ("claude.cmd", "claude"):
        p = npm_bin / name
        if p.exists():
            return str(p)
    return shutil.which("claude.cmd") or shutil.which("claude")


# ── Steps ─────────────────────────────────────────────────────────────────────

def check_prerequisites():
    print("\nStep 1/8 — Checking prerequisites")
    all_ok = True

    for cmd, name, url in [
        ("python --version", "Python 3.11+", "https://www.python.org/downloads/"),
        ("node --version",   "Node.js 18+",  "https://nodejs.org/"),
        ("git --version",    "git",           "https://git-scm.com/"),
    ]:
        r = run(cmd, capture=True)
        if r.returncode == 0:
            ok(f"{name}: {r.stdout.strip()}")
        else:
            err(f"{name} not found — install from {url}")
            all_ok = False

    claude = find_claude()
    if claude:
        r = run(f'"{claude}" --version', capture=True)
        ok(f"Claude Code: {r.stdout.strip()}")
    else:
        err("Claude Code not found.")
        info("Install: npm install -g @anthropic-ai/claude-code")
        info("Then:    claude auth login")
        all_ok = False

    if not all_ok:
        print("\nFix the above errors then re-run setup.bat.")
        sys.exit(1)


def clone_repos(base: Path):
    print("\nStep 2/8 — Cloning repositories")
    app_dir   = base / "app"
    vault_dir = base / "vault"

    if app_dir.exists():
        info(f"App already exists at {app_dir} — pulling latest...")
        run("git pull", cwd=str(app_dir))
    else:
        info("Cloning app repo...")
        run(f'git clone https://github.com/eytan90/mycockpit "{app_dir}"')
    ok("App repo ready")

    if vault_dir.exists():
        info(f"Vault already exists at {vault_dir}")
        ok("Vault repo ready")
    else:
        print()
        info("The vault repo is private — you need a GitHub Personal Access Token.")
        info("Get one: github.com/settings/tokens → Generate new token → select 'repo' scope")
        token = ask("GitHub token (press Enter to skip)").strip()
        if token:
            r = run(f'git clone https://{token}@github.com/eytan90/dustphotonics-vault.git "{vault_dir}"',
                    capture=True)
            if r.returncode == 0:
                ok("Vault repo cloned")
            else:
                err(f"Clone failed: {r.stderr.strip()}")
        else:
            info("Skipping vault clone.")

    return app_dir, vault_dir


def configure(app_dir: Path, vault_dir: Path):
    print("\nStep 3/8 — Configuring")
    config_file   = app_dir / "config.json"
    config_example = app_dir / "config.example.json"

    if config_file.exists():
        with open(config_file) as f:
            config = json.load(f)
        info("Existing config.json found — updating values.")
    else:
        shutil.copy(config_example, config_file)
        with open(config_file) as f:
            config = json.load(f)

    # vault_path (relative from app_dir)
    vault_rel = os.path.relpath(str(vault_dir), str(app_dir)).replace("\\", "/")
    config["vault_path"] = vault_rel
    ok(f"vault_path → {vault_rel}")

    # port
    port = ask("Port", str(config.get("port", 7844)))
    config["port"] = int(port)

    # credentials
    print()
    info("Set login credentials for remote access:")
    username = ask("Username", "eytanp")
    password = ask("Password")
    if password:
        config["ngrok_auth"] = f"{username}:{password}"
        ok("Credentials saved")
    else:
        info("Password not set — using existing value")

    # ngrok token
    print()
    info("ngrok authtoken enables remote access from anywhere.")
    info("Get it at: dashboard.ngrok.com/get-started/your-authtoken")
    info("(The token starts with a long number, e.g. 2abc123...)")
    ngrok_token = ask("ngrok authtoken (press Enter to skip)").strip()
    if ngrok_token:
        config["ngrok_token"] = ngrok_token
        ok("ngrok token saved")
    else:
        info("Skipping ngrok token — remote access will not be available")

    with open(config_file, "w") as f:
        json.dump(config, f, indent=2)
    ok("config.json saved")

    return config


def install_python_deps(app_dir: Path):
    print("\nStep 4/8 — Installing Python dependencies")
    r = run(f'pip install -r "{app_dir / "requirements.txt"}"')
    if r.returncode == 0:
        ok("Python dependencies installed")
    else:
        err("pip install failed — check the output above")
        sys.exit(1)


def build_frontend(app_dir: Path):
    print("\nStep 5/8 — Building frontend")
    frontend = app_dir / "frontend"
    run("npm install", cwd=str(frontend))
    r = run("npm run build", cwd=str(frontend))
    if r.returncode == 0:
        ok("Frontend built")
    else:
        err("Frontend build failed — check the output above")
        sys.exit(1)


def setup_ngrok(ngrok_token: str):
    print("\nStep 6/8 — Setting up ngrok")
    ngrok_cmd = find_ngrok()

    if not ngrok_cmd:
        info("Installing ngrok via winget...")
        run("winget install ngrok.ngrok -e --accept-package-agreements --accept-source-agreements")
        # Give winget a moment then search again
        time.sleep(2)
        ngrok_cmd = find_ngrok()

    if ngrok_cmd:
        info("Updating ngrok to latest version...")
        run(f'"{ngrok_cmd}" update')
        ok(f"ngrok ready: {ngrok_cmd}")

        if ngrok_token:
            r = run(f'"{ngrok_cmd}" config add-authtoken {ngrok_token}', capture=True)
            if r.returncode == 0:
                ok("ngrok authtoken configured")
            else:
                err(f"ngrok auth failed: {r.stderr.strip()}")
    else:
        err("ngrok install failed — install manually from ngrok.com/download")


def setup_autostart(app_dir: Path):
    print("\nStep 7/8 — Auto-start on Windows login")
    choice = ask("Register MyCockpit to start automatically on login? (y/N)", "N").lower()
    if choice != "y":
        info("Skipping auto-start registration")
        return

    python_exe = sys.executable
    run_bat    = str(app_dir / "run.bat")
    task_name  = "MyCockpit"

    # Use run.bat so it handles port conflicts on restart
    cmd = (f'schtasks /Create /TN "{task_name}" '
           f'/TR "\\"{run_bat}\\"" '
           f'/SC ONLOGON /RL HIGHEST /F')
    r = run(cmd, capture=True)
    if r.returncode == 0:
        ok("Auto-start registered — MyCockpit will start on next Windows login")
    else:
        err(f"Registration failed: {r.stderr.strip()}")
        info(f"You can start manually: run.bat in {app_dir}")


def launch(app_dir: Path):
    print("\nStep 8/8 — Launching MyCockpit")
    run_bat = app_dir / "run.bat"
    info("Starting server...")
    subprocess.Popen([str(run_bat)], cwd=str(app_dir),
                     creationflags=subprocess.CREATE_NEW_CONSOLE)
    time.sleep(6)
    ok("MyCockpit launched — check the new console window for the public URL")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 52)
    print("  MyCockpit Setup")
    print("=" * 52)

    check_prerequisites()

    # Install location
    print("\nInstall location")
    default_base = Path.home() / "mycockpit"
    base_input = ask("Base directory", str(default_base))
    base = Path(base_input)
    base.mkdir(parents=True, exist_ok=True)

    app_dir, vault_dir = clone_repos(base)
    config = configure(app_dir, vault_dir)
    install_python_deps(app_dir)
    build_frontend(app_dir)
    setup_ngrok(config.get("ngrok_token", ""))
    setup_autostart(app_dir)
    launch(app_dir)

    print("\n" + "=" * 52)
    print("  Setup complete!")
    print(f"  App:   {app_dir}")
    print(f"  Vault: {vault_dir}")
    print("  Check the MyCockpit console for the public URL.")
    print("=" * 52)


if __name__ == "__main__":
    main()
