import json
import asyncio
import tempfile
import mimetypes
from datetime import date
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import StreamingResponse, JSONResponse
from typing import List

from config import get_vault_path

router = APIRouter(prefix="/api/chat", tags=["chat"])

# ── State ─────────────────────────────────────────────────────────────────────

_session_id:   str | None = None
_ready:        bool       = False
_init_error:   str        = ""
_init_summary: str        = ""


# ── Live context (vault snapshot for init prompt) ─────────────────────────────

def _build_live_context() -> str:
    vault = get_vault_path()
    lines = []

    projects_dir = vault / "01_Projects"
    if projects_dir.exists():
        summaries = []
        for f in sorted(projects_dir.glob("*.md")):
            try:
                fm, in_fm = {}, False
                for line in f.read_text(encoding="utf-8").splitlines()[:25]:
                    if line.strip() == "---":
                        if not in_fm: in_fm = True; continue
                        else: break
                    if in_fm and ":" in line:
                        k, v = line.split(":", 1); fm[k.strip()] = v.strip()
                status = fm.get("status", "unknown")
                if status not in ("done", "cancelled"):
                    row = f"  - {fm.get('name', f.stem)} [{status}] {fm.get('progress','')}%"
                    if fm.get("next_action"): row += f" | next: {fm['next_action']}"
                    if fm.get("blockers"):    row += f" | blockers: {fm['blockers']}"
                    summaries.append(row.rstrip("% |"))
            except Exception:
                pass
        if summaries:
            lines.append("ACTIVE PROJECTS:"); lines.extend(summaries[:15])

    backlog = vault / "master_backlog.md"
    if backlog.exists():
        try:
            wip, high = [], []
            for line in backlog.read_text(encoding="utf-8").splitlines():
                low = line.lower()
                if ("- [ ]" in line or line.strip().startswith("-")) and len(line.strip()) > 4:
                    task = line.strip().lstrip("- [ ]").strip()
                    if any(s in low for s in ["in-progress", "wip", "doing"]):
                        wip.append(f"  - {task}")
                    elif "priority: high" in low or "high priority" in low:
                        high.append(f"  - {task}")
            if wip:  lines.append("\nIN PROGRESS:");   lines.extend(wip[:5])
            if high: lines.append("\nHIGH PRIORITY:"); lines.extend(high[:8])
        except Exception:
            pass

    for rel, section in [
        ("00_Dashboard/inbox.md", "INBOX"),
        ("00_Dashboard/goals.md", "ACTIVE GOALS"),
    ]:
        f = vault / rel
        if f.exists():
            try:
                items, in_s = [], False
                for line in f.read_text(encoding="utf-8").splitlines():
                    if section == "INBOX":
                        if "unreviewed" in line.lower() and line.startswith("#"): in_s = True; continue
                        if line.startswith("#"): in_s = False
                        if in_s and line.strip() and not line.startswith("#"):
                            items.append(f"  - {line.strip().lstrip('- ')}")
                    else:
                        if line.strip().startswith("-") and len(line.strip()) > 3:
                            items.append(f"  - {line.strip().lstrip('- ')}")
                if items:
                    count = f" ({len(items)} unreviewed)" if section == "INBOX" else ""
                    lines.append(f"\n{section}{count}:")
                    lines.extend(items[:8])
                    if len(items) > 8: lines.append(f"  ... +{len(items)-8} more")
            except Exception:
                pass

    lines.append("\nVAULT FOLDER INDEX:")
    for folder, desc in {
        "02_Research":         "Research notes, papers, competitive intel",
        "03_Team":             "Team profiles, 1:1 notes, performance",
        "04_Processes":        "Test workflows, SOPs",
        "06_Docs_and_Reports": "Technical docs, reports, meeting notes",
    }.items():
        d = vault / folder
        if d.exists():
            count = len(list(d.rglob("*.md")))
            lines.append(f"  - {folder}/ ({count} files) — {desc}")

    return "\n".join(lines)


def _build_init_prompt() -> str:
    vault     = get_vault_path()
    claude_md = vault / "CLAUDE.md"
    workspace = claude_md.read_text(encoding="utf-8") if claude_md.exists() else ""
    today     = date.today().isoformat()
    live      = _build_live_context()
    return (
        f"You are Claude, embedded as Chief of Staff in Eytan's MyCockpit (Dust Photonics). "
        f"Today: {today}. Your current working directory is the full Dustphotonics vault — you have "
        f"direct filesystem access to all vault files via your built-in tools (Read, Glob, etc.). "
        f"Be concise and action-oriented.\n\n"
        f"=== WORKSPACE ===\n{workspace}\n\n"
        f"=== LIVE VAULT STATE ===\n{live}\n\n"
        f"You are now initialized. In 2-3 tight bullet points summarize: active project count and "
        f"statuses, any urgent items, inbox count. Under 60 words."
    )


# ── Claude CLI bridge ─────────────────────────────────────────────────────────

async def _stream_claude(prompt: str, image_paths: list[str] | None = None):
    """
    Calls `claude -p prompt --output-format stream-json [--resume session_id]`.
    Yields text chunks as they arrive. Updates _session_id at end.
    """
    global _session_id

    cmd = ["claude", "-p", prompt, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"]
    if _session_id:
        cmd.extend(["--resume", _session_id])
    for img in (image_paths or []):
        cmd.extend(["--image", img])

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(get_vault_path()),
    )

    last_len = 0
    new_sid  = None
    yielded  = False
    stderr_chunks = []

    # Read stdout and stderr concurrently
    async def read_stderr():
        async for line in proc.stderr:
            stderr_chunks.append(line.decode("utf-8", errors="replace"))

    asyncio.ensure_future(read_stderr())

    async for raw in proc.stdout:
        line = raw.decode("utf-8", errors="replace").strip()
        if not line:
            continue
        try:
            ev    = json.loads(line)
            etype = ev.get("type", "")

            if etype == "assistant":
                content = ev.get("message", {}).get("content", [])
                full    = "".join(b.get("text", "") for b in content if b.get("type") == "text")
                if len(full) > last_len:
                    yield full[last_len:]
                    last_len = len(full)
                    yielded = True

            elif etype == "result":
                new_sid = ev.get("session_id")
                result  = ev.get("result", "")
                if result and not yielded:
                    yield result
                    yielded = True

        except json.JSONDecodeError:
            # Raw text line (non-JSON mode fallback)
            yield line
            yielded = True

    await proc.wait()

    if new_sid:
        _session_id = new_sid

    # If nothing was yielded, surface stderr as an error
    if not yielded and stderr_chunks:
        err = "".join(stderr_chunks).strip()
        raise RuntimeError(f"claude CLI error: {err}")


async def _call_claude(prompt: str) -> tuple[str, str | None]:
    """Non-streaming call. Returns (text, session_id)."""
    global _session_id

    cmd = ["claude", "-p", prompt, "--output-format", "json", "--dangerously-skip-permissions"]
    if _session_id:
        cmd.extend(["--resume", _session_id])

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(get_vault_path()),
    )
    stdout, stderr = await proc.communicate()
    out = stdout.decode("utf-8", errors="replace").strip()
    err = stderr.decode("utf-8", errors="replace").strip()

    try:
        data = json.loads(out)
        return data.get("result", ""), data.get("session_id")
    except Exception:
        if out:
            return out, None
        raise RuntimeError(err or "claude CLI returned no output")


# ── Startup warm-up ───────────────────────────────────────────────────────────

async def init_session():
    global _ready, _init_error, _init_summary, _session_id

    try:
        text, sid = await _call_claude(_build_init_prompt())
        if sid:
            _session_id = sid
        _init_summary = text.strip()
        _ready = True

    except FileNotFoundError:
        _init_error = "claude CLI not found — make sure Claude Code is installed and `claude` is on PATH."
        _ready = False
    except Exception as e:
        _init_error = str(e)
        _ready = True  # allow chat even if init failed


async def close_session():
    pass  # session lives in claude's own storage; nothing to clean up


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/status")
async def chat_status():
    return JSONResponse({
        "ready":        _ready,
        "error":        _init_error or None,
        "has_context":  _session_id is not None,
        "init_summary": _init_summary or None,
    })


TEXT_EXTENSIONS = {'.txt', '.md', '.py', '.js', '.ts', '.tsx', '.jsx', '.json',
                   '.csv', '.yaml', '.yml', '.html', '.css', '.sh', '.bat', '.log'}
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}


async def _process_files(files: list[UploadFile]) -> tuple[str, list[str], list[str]]:
    """
    Returns (text_context, image_paths, temp_dirs_to_cleanup).
    text_context: prepended to the prompt.
    image_paths: absolute paths to saved image temp files.
    """
    text_parts: list[str] = []
    image_paths: list[str] = []
    temp_files: list[str] = []

    for f in files:
        ext = Path(f.filename or "").suffix.lower()
        data = await f.read()

        if ext in IMAGE_EXTENSIONS:
            # Save to temp file so claude CLI can read it
            suffix = ext or ".jpg"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            tmp.write(data)
            tmp.close()
            image_paths.append(tmp.name)
            temp_files.append(tmp.name)

        elif ext in TEXT_EXTENSIONS:
            try:
                text_parts.append(f"--- {f.filename} ---\n{data.decode('utf-8', errors='replace')}")
            except Exception:
                pass

        elif ext == '.pdf':
            # Basic PDF text extraction without external deps
            try:
                raw = data.decode('latin-1', errors='replace')
                # Extract readable text between stream markers
                import re
                chunks = re.findall(r'BT(.*?)ET', raw, re.DOTALL)
                visible = re.sub(r'[^\x20-\x7E\n]', '', ' '.join(chunks))[:4000]
                if visible.strip():
                    text_parts.append(f"--- {f.filename} (PDF text extract) ---\n{visible}")
                else:
                    text_parts.append(f"--- {f.filename} (PDF — could not extract text) ---")
            except Exception:
                pass

    text_context = "\n\n".join(text_parts)
    return text_context, image_paths, temp_files


@router.post("/message")
async def chat_message(
    message: str = Form(default=""),
    files: List[UploadFile] = File(default=[]),
):
    text_context, image_paths, temp_files = await _process_files(files)

    # Build final prompt — prepend file content if any
    prompt = message
    if text_context:
        prompt = f"{text_context}\n\n{message}" if message else text_context

    async def stream():
        try:
            async for chunk in _stream_claude(prompt, image_paths=image_paths or None):
                yield f"data: {json.dumps({'text': chunk})}\n\n"
            yield "data: [DONE]\n\n"
        except FileNotFoundError:
            yield f"data: {json.dumps({'error': 'claude CLI not found — install Claude Code and ensure it is on PATH.'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            # Clean up temp image files
            for p in temp_files:
                try:
                    Path(p).unlink(missing_ok=True)
                except Exception:
                    pass

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/clear")
async def chat_clear():
    global _session_id
    _session_id = None  # next message starts a fresh session
    return JSONResponse({"status": "ok"})


@router.post("/refresh-context")
async def refresh_context():
    return JSONResponse({"status": "ok"})
