import asyncio
import json
import threading
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversation import handle_user_message, check_task_running
from app.crud import add_message, create_session, get_session, list_messages
from app.db import AsyncSessionLocal, get_db
from app.llm import TASK_PROMPT_MARKERS, client as openai_client, parse_task_prompt, stream_assistant_text
from app.models import Session as SessionModel
from app.schemas import (
    AudioChatResponse,
    ChatResponse,
    MessageCreateRequest,
    MessageResponse,
    SessionCreateResponse,
    SessionResponse,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionCreateResponse)
async def create_session_endpoint(db: AsyncSession = Depends(get_db)) -> SessionCreateResponse:
    session = await create_session(db)
    return SessionCreateResponse(id=session.id, status=session.status, created_at=session.created_at)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session_endpoint(
    session_id: UUID,
    include_messages: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    session = await get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages: list[MessageResponse] = []
    if include_messages:
        rows = await list_messages(db, session_id)
        messages = [
            MessageResponse(id=m.id, role=m.role, content=m.content, created_at=m.created_at)
            for m in rows
        ]

    return SessionResponse(
        id=session.id,
        status=session.status,
        pending_task_prompt=session.pending_task_prompt,
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=messages,
    )


@router.post("/{session_id}/messages", response_model=ChatResponse)
async def add_message_endpoint(
    session_id: UUID,
    payload: MessageCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    session = await get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    response = await handle_user_message(db, session, payload.content)
    return response


@router.post("/{session_id}/messages/stream")
async def add_message_stream_endpoint(
    session_id: UUID,
    payload: MessageCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    from app.conversation import _get_zep

    session = await get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await add_message(db, session.id, "user", payload.content)

    # Store user message in Zep
    zep = _get_zep()
    if zep:
        zep.add_message("user", payload.content)

    running = await check_task_running(db, session)
    if running:
        async def busy_stream():
            yield f"data: {json.dumps({'type': 'message', 'text': running.assistant_message.content})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'task_id': None})}\n\n"

        return StreamingResponse(busy_stream(), media_type="text/event-stream")

    # Fetch Zep context for LLM enrichment
    memory_context = zep.get_context() if zep else ""

    messages = await list_messages(db, session.id)

    marker_max_len = max(len(marker) for marker in TASK_PROMPT_MARKERS)

    async def event_stream():
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()

        def producer():
            try:
                for delta in stream_assistant_text(messages, memory_context=memory_context):
                    asyncio.run_coroutine_threadsafe(queue.put(("delta", delta)), loop)
                asyncio.run_coroutine_threadsafe(queue.put(("done", "")), loop)
            except Exception as exc:
                asyncio.run_coroutine_threadsafe(queue.put(("error", str(exc))), loop)

        threading.Thread(target=producer, daemon=True).start()

        buffer = ""
        full_text = ""
        marker_found = False

        while True:
            if await request.is_disconnected():
                break

            kind, value = await queue.get()
            if kind == "delta":
                full_text += value
                if marker_found:
                    continue

                buffer += value
                marker_index = -1
                marker_len = 0
                for marker in TASK_PROMPT_MARKERS:
                    idx = buffer.find(marker)
                    if idx != -1 and (marker_index == -1 or idx < marker_index):
                        marker_index = idx
                        marker_len = len(marker)

                if marker_index != -1:
                    before = buffer[:marker_index]
                    if before:
                        yield f"data: {json.dumps({'type': 'delta', 'text': before})}\n\n"
                    buffer = buffer[marker_index + marker_len :]
                    marker_found = True
                    continue

                if len(buffer) > marker_max_len:
                    flush = buffer[:-marker_max_len]
                    buffer = buffer[-marker_max_len:]
                    if flush:
                        yield f"data: {json.dumps({'type': 'delta', 'text': flush})}\n\n"
            elif kind == "error":
                yield f"data: {json.dumps({'type': 'error', 'message': value})}\n\n"
                break
            elif kind == "done":
                if not marker_found and buffer:
                    yield f"data: {json.dumps({'type': 'delta', 'text': buffer})}\n\n"

                assistant_text, task_prompt = parse_task_prompt(full_text)

                # Store assistant message in Zep
                if zep:
                    zep.add_message("assistant", assistant_text)

                task_id = None
                async with AsyncSessionLocal() as db2:
                    session_row = await db2.get(SessionModel, str(session_id))
                    if session_row:
                        if task_prompt:
                            from app.crud import create_task
                            from app.task_executor import execute_task_background

                            task = await create_task(db2, session_row, task_prompt)
                            task_id = task.id
                        else:
                            session_row.status = "idle"
                            session_row.pending_task_prompt = None
                            await db2.commit()

                    msg = await add_message(db2, session_id, "assistant", assistant_text)

                # Yield done event BEFORE starting background task
                yield f"data: {json.dumps({'type': 'done', 'message_id': str(msg.id), 'task_prompt': task_prompt, 'task_id': str(task_id) if task_id else None})}\n\n"

                # Start task in background AFTER response is sent
                if task_id and task_prompt:
                    asyncio.create_task(execute_task_background(str(task_id), str(session_id), task_prompt))

                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")


async def _transcribe(file: UploadFile) -> str:
    """Transcribe an uploaded audio file via OpenAI Whisper."""
    # Read file content before passing to thread — SpooledTemporaryFile can't cross threads safely
    content = await file.read()
    filename = file.filename or "audio.webm"
    content_type = file.content_type or "audio/webm"

    transcript = await asyncio.to_thread(
        lambda: openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, content, content_type),
        )
    )
    return transcript.text


@router.post("/{session_id}/messages/audio", response_model=AudioChatResponse)
async def add_audio_message_endpoint(
    session_id: UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
) -> AudioChatResponse:
    session = await get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    transcription = await _transcribe(file)
    response = await handle_user_message(db, session, transcription)
    return AudioChatResponse(
        assistant_message=response.assistant_message,
        task_id=response.task_id,
        transcription=transcription,
    )


@router.post("/{session_id}/messages/audio/stream")
async def add_audio_message_stream_endpoint(
    session_id: UUID,
    file: UploadFile,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    from app.conversation import _get_zep

    session = await get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    transcription = await _transcribe(file)

    await add_message(db, session.id, "user", transcription)

    # Store user message in Zep
    zep = _get_zep()
    if zep:
        zep.add_message("user", transcription)

    running = await check_task_running(db, session)
    if running:
        async def busy_stream():
            yield f"data: {json.dumps({'type': 'transcription', 'text': transcription})}\n\n"
            yield f"data: {json.dumps({'type': 'message', 'text': running.assistant_message.content})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'task_id': None})}\n\n"

        return StreamingResponse(busy_stream(), media_type="text/event-stream")

    # Fetch Zep context for LLM enrichment
    memory_context = zep.get_context() if zep else ""

    messages = await list_messages(db, session.id)

    marker_max_len = max(len(marker) for marker in TASK_PROMPT_MARKERS)

    async def event_stream():
        yield f"data: {json.dumps({'type': 'transcription', 'text': transcription})}\n\n"

        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()

        def producer():
            try:
                for delta in stream_assistant_text(messages, memory_context=memory_context):
                    asyncio.run_coroutine_threadsafe(queue.put(("delta", delta)), loop)
                asyncio.run_coroutine_threadsafe(queue.put(("done", "")), loop)
            except Exception as exc:
                asyncio.run_coroutine_threadsafe(queue.put(("error", str(exc))), loop)

        threading.Thread(target=producer, daemon=True).start()

        buffer = ""
        full_text = ""
        marker_found = False

        while True:
            if await request.is_disconnected():
                break

            kind, value = await queue.get()
            if kind == "delta":
                full_text += value
                if marker_found:
                    continue

                buffer += value
                marker_index = -1
                marker_len = 0
                for marker in TASK_PROMPT_MARKERS:
                    idx = buffer.find(marker)
                    if idx != -1 and (marker_index == -1 or idx < marker_index):
                        marker_index = idx
                        marker_len = len(marker)

                if marker_index != -1:
                    before = buffer[:marker_index]
                    if before:
                        yield f"data: {json.dumps({'type': 'delta', 'text': before})}\n\n"
                    buffer = buffer[marker_index + marker_len :]
                    marker_found = True
                    continue

                if len(buffer) > marker_max_len:
                    flush = buffer[:-marker_max_len]
                    buffer = buffer[-marker_max_len:]
                    if flush:
                        yield f"data: {json.dumps({'type': 'delta', 'text': flush})}\n\n"
            elif kind == "error":
                yield f"data: {json.dumps({'type': 'error', 'message': value})}\n\n"
                break
            elif kind == "done":
                if not marker_found and buffer:
                    yield f"data: {json.dumps({'type': 'delta', 'text': buffer})}\n\n"

                assistant_text, task_prompt = parse_task_prompt(full_text)

                # Store assistant message in Zep
                if zep:
                    zep.add_message("assistant", assistant_text)

                task_id = None
                async with AsyncSessionLocal() as db2:
                    session_row = await db2.get(SessionModel, str(session_id))
                    if session_row:
                        if task_prompt:
                            from app.crud import create_task
                            from app.task_executor import execute_task_background

                            task = await create_task(db2, session_row, task_prompt)
                            task_id = task.id
                        else:
                            session_row.status = "idle"
                            session_row.pending_task_prompt = None
                            await db2.commit()

                    msg = await add_message(db2, session_id, "assistant", assistant_text)

                # Yield done event BEFORE starting background task
                yield f"data: {json.dumps({'type': 'done', 'message_id': str(msg.id), 'task_prompt': task_prompt, 'task_id': str(task_id) if task_id else None})}\n\n"

                # Start task in background AFTER response is sent
                if task_id and task_prompt:
                    asyncio.create_task(execute_task_background(str(task_id), str(session_id), task_prompt))

                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")
