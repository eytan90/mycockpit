import json
import msal
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, JSONResponse

router = APIRouter(prefix="/api/oauth", tags=["oauth"])

SCOPES = ["Mail.Read", "Mail.Send", "Tasks.ReadWrite", "offline_access", "User.Read"]
TOKENS_FILE = Path(__file__).parent.parent / "tokens.json"

# In-memory store for pending auth code flows (state -> flow_data)
_pending_flows: dict = {}


def _load_config() -> dict:
    from config import load_config
    return load_config()


def _get_msal_app(cache: msal.SerializableTokenCache | None = None) -> msal.ConfidentialClientApplication:
    cfg = _load_config()
    return msal.ConfidentialClientApplication(
        client_id=cfg.get("ms_client_id", ""),
        client_credential=cfg.get("ms_client_secret", ""),
        authority=f"https://login.microsoftonline.com/{cfg.get('ms_tenant_id', 'common')}",
        token_cache=cache,
    )


def _load_cache() -> msal.SerializableTokenCache:
    cache = msal.SerializableTokenCache()
    if TOKENS_FILE.exists():
        cache.deserialize(TOKENS_FILE.read_text(encoding="utf-8"))
    return cache


def _save_cache(cache: msal.SerializableTokenCache):
    if cache.has_state_changed:
        TOKENS_FILE.write_text(cache.serialize(), encoding="utf-8")


async def get_access_token() -> str:
    """Shared helper used by email.py and ms_tasks.py."""
    from fastapi import HTTPException
    cache = _load_cache()
    app = _get_msal_app(cache)
    accounts = app.get_accounts()
    if not accounts:
        raise HTTPException(status_code=401, detail="Not connected to Microsoft — visit /email to sign in")
    result = app.acquire_token_silent(SCOPES, account=accounts[0])
    _save_cache(cache)
    if not result or "access_token" not in result:
        raise HTTPException(status_code=401, detail="Token refresh failed — please reconnect")
    return result["access_token"]


@router.get("/login")
async def oauth_login(request: Request):
    cfg = _load_config()
    port = cfg.get("port", 7844)
    redirect_uri = f"http://localhost:{port}/api/oauth/callback"

    app = _get_msal_app()
    flow = app.initiate_auth_code_flow(SCOPES, redirect_uri=redirect_uri)
    _pending_flows[flow["state"]] = {"flow": flow, "redirect_uri": redirect_uri}

    return RedirectResponse(flow["auth_uri"])


@router.get("/callback")
async def oauth_callback(request: Request):
    params = dict(request.query_params)
    error = params.get("error")
    if error:
        desc = params.get("error_description", error)
        return RedirectResponse(f"/?oauth_error={desc}")

    state = params.get("state", "")
    pending = _pending_flows.pop(state, None)
    if not pending:
        return RedirectResponse("/?oauth_error=invalid_state")

    cache = _load_cache()
    app = _get_msal_app(cache)

    result = app.acquire_token_by_auth_code_flow(pending["flow"], params)
    if "error" in result:
        desc = result.get("error_description", result.get("error", "unknown"))
        return RedirectResponse(f"/?oauth_error={desc}")

    _save_cache(cache)
    return RedirectResponse("/")


@router.get("/status")
async def oauth_status():
    cache = _load_cache()
    app = _get_msal_app(cache)
    accounts = app.get_accounts()
    if accounts:
        return {"connected": True, "account": accounts[0].get("username")}
    return {"connected": False, "account": None}


@router.delete("/logout")
async def oauth_logout():
    if TOKENS_FILE.exists():
        TOKENS_FILE.unlink()
    return {"ok": True}
