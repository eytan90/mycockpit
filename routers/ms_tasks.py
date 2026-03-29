from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from routers.oauth import get_access_token

router = APIRouter(prefix="/api/ms-tasks", tags=["ms-tasks"])

GRAPH = "https://graph.microsoft.com/v1.0"


async def _graph_get(path: str, params: dict | None = None) -> Any:
    token = await get_access_token()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(
            f"{GRAPH}{path}",
            headers={"Authorization": f"Bearer {token}"},
            params=params or {},
        )
    if r.status_code == 401:
        raise HTTPException(status_code=401, detail="Microsoft token expired — please reconnect")
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()


async def _graph_post(path: str, body: dict) -> Any:
    token = await get_access_token()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{GRAPH}{path}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=body,
        )
    if r.status_code == 401:
        raise HTTPException(status_code=401, detail="Microsoft token expired — please reconnect")
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json() if r.content else {}


async def _graph_patch(path: str, body: dict) -> Any:
    token = await get_access_token()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.patch(
            f"{GRAPH}{path}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=body,
        )
    if r.status_code == 401:
        raise HTTPException(status_code=401, detail="Microsoft token expired — please reconnect")
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json() if r.content else {}


async def _graph_delete(path: str) -> None:
    token = await get_access_token()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.delete(
            f"{GRAPH}{path}",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code == 401:
        raise HTTPException(status_code=401, detail="Microsoft token expired — please reconnect")
    if not r.is_success and r.status_code != 404:
        raise HTTPException(status_code=r.status_code, detail=r.text)


# ── Task lists ─────────────────────────────────────────────────────────────────

@router.get("/lists")
async def list_task_lists():
    data = await _graph_get("/me/todo/lists")
    lists = [
        {"id": lst["id"], "name": lst.get("displayName", ""), "isOwner": lst.get("isOwner", True)}
        for lst in data.get("value", [])
    ]
    return {"lists": lists}


# ── Tasks in a list ────────────────────────────────────────────────────────────

@router.get("/lists/{list_id}/tasks")
async def list_tasks(list_id: str):
    data = await _graph_get(
        f"/me/todo/lists/{list_id}/tasks",
        params={
            "$select": "id,title,status,dueDateTime,importance,createdDateTime,lastModifiedDateTime",
            "$orderby": "createdDateTime desc",
            "$top": 200,
        },
    )
    tasks = []
    for t in data.get("value", []):
        due = t.get("dueDateTime", {})
        tasks.append({
            "id": t["id"],
            "title": t.get("title", ""),
            "status": t.get("status", "notStarted"),
            "completed": t.get("status") == "completed",
            "dueDate": due.get("dateTime", "")[:10] if due else None,
            "importance": t.get("importance", "normal"),
            "createdAt": t.get("createdDateTime", ""),
        })
    return {"tasks": tasks}


# ── Create task ────────────────────────────────────────────────────────────────

class CreateTaskRequest(BaseModel):
    title: str
    dueDate: str | None = None
    importance: str = "normal"


@router.post("/lists/{list_id}/tasks")
async def create_task(list_id: str, req: CreateTaskRequest):
    body: dict = {
        "title": req.title,
        "importance": req.importance,
    }
    if req.dueDate:
        body["dueDateTime"] = {"dateTime": f"{req.dueDate}T00:00:00", "timeZone": "UTC"}
    result = await _graph_post(f"/me/todo/lists/{list_id}/tasks", body)
    return {
        "id": result.get("id"),
        "title": result.get("title"),
        "status": result.get("status", "notStarted"),
        "completed": False,
        "dueDate": req.dueDate,
        "importance": result.get("importance", "normal"),
    }


# ── Update task ────────────────────────────────────────────────────────────────

class UpdateTaskRequest(BaseModel):
    title: str | None = None
    status: str | None = None
    completed: bool | None = None
    dueDate: str | None = None
    importance: str | None = None


@router.patch("/lists/{list_id}/tasks/{task_id}")
async def update_task(list_id: str, task_id: str, req: UpdateTaskRequest):
    body: dict = {}
    if req.title is not None:
        body["title"] = req.title
    if req.importance is not None:
        body["importance"] = req.importance
    if req.completed is not None:
        body["status"] = "completed" if req.completed else "notStarted"
    elif req.status is not None:
        body["status"] = req.status
    if req.dueDate is not None:
        body["dueDateTime"] = {"dateTime": f"{req.dueDate}T00:00:00", "timeZone": "UTC"} if req.dueDate else None
    result = await _graph_patch(f"/me/todo/lists/{list_id}/tasks/{task_id}", body)
    return {"ok": True, "task": result}


# ── Delete task ────────────────────────────────────────────────────────────────

@router.delete("/lists/{list_id}/tasks/{task_id}")
async def delete_task(list_id: str, task_id: str):
    await _graph_delete(f"/me/todo/lists/{list_id}/tasks/{task_id}")
    return {"ok": True}
