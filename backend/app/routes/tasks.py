import asyncio
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.crud import create_task, get_session, get_task, list_artifacts, list_task_events
from app.db import get_db
from app.schemas import (
    ArtifactResponse,
    TaskCreateRequest,
    TaskEventResponse,
    TaskResponse,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("/sessions/{session_id}", response_model=TaskResponse)
async def create_task_endpoint(
    session_id: UUID,
    payload: TaskCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    session = await get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == "task_running":
        raise HTTPException(status_code=409, detail="A task is already running")

    prompt = payload.prompt or session.pending_task_prompt
    if not prompt:
        raise HTTPException(status_code=400, detail="No task prompt provided")

    task = await create_task(db, session, prompt)
    return TaskResponse(
        id=task.id,
        session_id=task.session_id,
        status=task.status,
        prompt=task.prompt,
        error=task.error,
        agreed_at=task.agreed_at,
        started_at=task.started_at,
        finished_at=task.finished_at,
        created_at=task.created_at,
    )


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task_endpoint(
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    task = await get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return TaskResponse(
        id=task.id,
        session_id=task.session_id,
        status=task.status,
        prompt=task.prompt,
        error=task.error,
        agreed_at=task.agreed_at,
        started_at=task.started_at,
        finished_at=task.finished_at,
        created_at=task.created_at,
    )


@router.get("/{task_id}/events", response_model=list[TaskEventResponse])
async def list_events_endpoint(
    task_id: UUID,
    after_id: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
) -> list[TaskEventResponse]:
    events = await list_task_events(db, task_id, after_id=after_id, limit=limit)
    return [
        TaskEventResponse(id=e.id, type=e.type, payload=e.payload, created_at=e.created_at)
        for e in events
    ]


@router.get("/{task_id}/events/stream")
async def stream_events_endpoint(
    task_id: UUID,
    request: Request,
    after_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    async def event_stream():
        last_id = after_id
        while True:
            if await request.is_disconnected():
                break
            events = await list_task_events(
                db, task_id, after_id=last_id, limit=settings.max_events_per_poll
            )
            for event in events:
                last_id = event.id
                payload = {
                    "id": event.id,
                    "type": event.type,
                    "payload": event.payload,
                    "created_at": event.created_at.isoformat() if event.created_at else None,
                }
                yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(settings.task_poll_interval)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/{task_id}/artifacts", response_model=list[ArtifactResponse])
async def list_artifacts_endpoint(
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> list[ArtifactResponse]:
    artifacts = await list_artifacts(db, task_id)
    return [
        ArtifactResponse(
            id=a.id,
            type=a.type,
            location=a.location,
            data=a.data,
            created_at=a.created_at,
        )
        for a in artifacts
    ]
