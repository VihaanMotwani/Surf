import asyncio
import json
import logging
import threading
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.conversation import handle_user_message, check_task_running
from app.config import settings
from app.crud import add_message, create_session, delete_session, get_latest_task_result, get_session, list_messages, list_sessions
from app.db import AsyncSessionLocal, get_db
from app.llm import TASK_PROMPT_MARKERS, client as openai_client, is_describe_request, parse_task_prompt, stream_assistant_text, stream_describe_screenshot
from app.local_memory import extract_and_store_facts, get_memory_context as get_local_memory_context
from app.uploads import clear_uploads
from app.memory_extractor import extract_memory_facts
from app.message_events import message_event_stream
from app.models import Session as SessionModel
from app.schemas import (
    AudioChatResponse,
    ChatResponse,
    MessageCreateRequest,
    MessageResponse,
    SessionCreateResponse,
    SessionListItem,
    SessionResponse,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])

logger = logging.getLogger(__name__)


def _build_task_context(task_result: dict | None) -> str:
    """Build a rich LLM context string from a task result dict."""
    if not task_result:
        return ""

    payload = task_result.get("payload", {})
    lines = [
        "--- LAST BROWSER TASK ---",
        f"Task: {task_result['prompt']}",
        f"Status: {task_result['status']}",
    ]

    if task_result["status"] == "succeeded":
        final = payload.get("final_result")
        if final:
            lines.append(f"Final result: {final}")

        n_steps = payload.get("number_of_steps")
        duration = payload.get("total_duration_seconds")
        if n_steps or duration is not None:
            meta = []
            if n_steps:
                meta.append(f"{n_steps} steps")
            if duration is not None:
                meta.append(f"{round(duration, 1)}s")
            lines.append(f"Overview: {', '.join(meta)}")

        # Step-by-step breakdown
        steps = payload.get("steps", [])
        if steps:
            lines.append("")
            lines.append("Step-by-step:")
            for step in steps:
                step_num = step.get("step", "?")
                title = step.get("page_title", "")
                url = step.get("url", "")
                goal = step.get("next_goal", "")
                evaluation = step.get("evaluation", "")

                header = f"  Step {step_num}"
                if title:
                    header += f" [{title}]"
                if url and url != "about:blank":
                    header += f" ({url})"
                lines.append(header)

                if evaluation:
                    lines.append(f"    Evaluation: {evaluation}")
                if goal:
                    lines.append(f"    Goal: {goal}")

                for action in step.get("actions", []):
                    if isinstance(action, dict):
                        for action_name, params in action.items():
                            if isinstance(params, dict):
                                lines.append(f"    Action: {action_name}({', '.join(f'{k}={v!r}' for k, v in params.items())})")
                            else:
                                lines.append(f"    Action: {action_name}: {params}")

                for r in step.get("results", []):
                    if r.get("extracted_content"):
                        lines.append(f"    Content: {r['extracted_content']}")
                    if r.get("error"):
                        lines.append(f"    Error: {r['error']}")

        # Extracted content summary
        extracted = payload.get("extracted_content", [])
        if extracted:
            lines.append("")
            lines.append("Extracted content:")
            for content in extracted:
                lines.append(f"  - {content}")

        # Unique URLs
        urls = payload.get("urls", [])
        if urls:
            lines.append("")
            lines.append("Pages visited: " + ", ".join(urls))

        errors = payload.get("errors", [])
        if errors:
            lines.append("Errors: " + "; ".join(errors))

    elif task_result.get("error"):
        lines.append(f"Error: {task_result['error']}")

    lines.append("--- END TASK ---")
    lines.append("Use this data only if the user asks about the task. Otherwise continue normally.")

    return "\n".join(lines)


@router.post("", response_model=SessionCreateResponse)
async def create_session_endpoint(db: AsyncSession = Depends(get_db)) -> SessionCreateResponse:
    session = await create_session(db)
    return SessionCreateResponse(id=session.id, status=session.status, created_at=session.created_at)


@router.get("", response_model=list[SessionListItem])
async def list_sessions_endpoint(db: AsyncSession = Depends(get_db)):
    return await list_sessions(db)


@router.delete("/{session_id}")
async def delete_session_endpoint(session_id: UUID, db: AsyncSession = Depends(get_db)):
    deleted = await delete_session(db, str(session_id))
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    clear_uploads(str(session_id))
    return {"success": True}


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
        title=session.title,
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

    # Fetch memory context for LLM enrichment (always include local facts)
    local_ctx = await get_local_memory_context()
    zep_ctx = zep.get_context() if zep else ""

    # Include latest browser task result so the LLM can describe it if asked
    task_result = await get_latest_task_result(db, str(session_id))
    task_ctx = _build_task_context(task_result)

    memory_context = "\n\n".join(filter(None, [zep_ctx, local_ctx, task_ctx]))

    user_content = payload.content
    messages = await list_messages(db, session.id)

    # Check if this is a "describe screen" request
    if is_describe_request(user_content):
        from app.task_executor import capture_screenshot_b64

        async def describe_stream():
            screenshot = await capture_screenshot_b64(session_id=str(session_id))
            if not screenshot:
                no_screen_msg = "I don't have a browser screen to describe right now. Start a browser task first, then ask me to describe what I see."
                yield f"data: {json.dumps({'type': 'delta', 'text': no_screen_msg})}\n\n"
                async with AsyncSessionLocal() as db2:
                    msg = await add_message(db2, session_id, "assistant", no_screen_msg)
                yield f"data: {json.dumps({'type': 'done', 'message_id': str(msg.id), 'task_prompt': None, 'task_id': None})}\n\n"
                return

            loop = asyncio.get_running_loop()
            queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()

            def producer():
                try:
                    for delta in stream_describe_screenshot(screenshot, user_content):
                        asyncio.run_coroutine_threadsafe(queue.put(("delta", delta)), loop)
                    asyncio.run_coroutine_threadsafe(queue.put(("done", "")), loop)
                except Exception as exc:
                    asyncio.run_coroutine_threadsafe(queue.put(("error", str(exc))), loop)

            threading.Thread(target=producer, daemon=True).start()

            full_text = ""
            while True:
                if await request.is_disconnected():
                    break
                kind, value = await queue.get()
                if kind == "delta":
                    full_text += value
                    yield f"data: {json.dumps({'type': 'delta', 'text': value})}\n\n"
                elif kind == "error":
                    yield f"data: {json.dumps({'type': 'error', 'message': value})}\n\n"
                    break
                elif kind == "done":
                    async with AsyncSessionLocal() as db2:
                        msg = await add_message(db2, session_id, "assistant", full_text)
                    yield f"data: {json.dumps({'type': 'done', 'message_id': str(msg.id), 'task_prompt': None, 'task_id': None})}\n\n"
                    break

        return StreamingResponse(describe_stream(), media_type="text/event-stream")

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
                    async def _extract_to_zep():
                        try:
                            facts = await extract_memory_facts(
                                messages=[
                                    {"role": "user", "content": user_content},
                                    {"role": "assistant", "content": assistant_text},
                                ],
                                existing_context=zep_ctx,
                                user_name=str(settings.zep_user_name or "User"),
                            )
                            if facts:
                                zep.store_extracted_facts(facts)
                        except Exception:
                            logger.exception("Zep memory extraction failed")

                    asyncio.create_task(_extract_to_zep())

                task_id = None
                async with AsyncSessionLocal() as db2:
                    session_row = await db2.get(SessionModel, str(session_id))
                    if session_row:
                        # Auto-title: set to first user message (truncated) if no title yet
                        if not session_row.title:
                            session_row.title = user_content[:50]

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

                # Background fact extraction - only if Zep is NOT configured
                if not settings.zep_api_key:
                    asyncio.create_task(extract_and_store_facts(user_content, assistant_text, session_id=str(session_id)))

                # Start task in background AFTER response is sent
                if task_id and task_prompt:
                    asyncio.create_task(execute_task_background(str(task_id), str(session_id), task_prompt))

                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")


_MIME_TO_EXT = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "mp4",
    "audio/m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/mpga": "mpga",
    "audio/oga": "oga",
    "video/webm": "webm",
    "video/mp4": "mp4",
}


async def _transcribe(file: UploadFile) -> str:
    """Transcribe an uploaded audio file via OpenAI Whisper."""
    content = await file.read()
    content_type = file.content_type or "audio/webm"

    # Derive a filename with a valid extension so Whisper accepts it
    ext = _MIME_TO_EXT.get(content_type, "webm")
    filename = f"audio.{ext}"

    transcript = await asyncio.to_thread(
        lambda: openai_client.audio.transcriptions.create(
            model="whisper-1",
            language="en",
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

    # Fetch memory context for LLM enrichment (always include local facts)
    local_ctx = await get_local_memory_context()
    zep_ctx = zep.get_context() if zep else ""

    # Include latest browser task result so the LLM can describe it if asked
    task_result = await get_latest_task_result(db, str(session_id))
    task_ctx = _build_task_context(task_result)

    memory_context = "\n\n".join(filter(None, [zep_ctx, local_ctx, task_ctx]))

    audio_user_content = transcription
    messages = await list_messages(db, session.id)

    # Check if this is a "describe screen" request (via voice)
    if is_describe_request(transcription):
        from app.task_executor import capture_screenshot_b64

        async def describe_audio_stream():
            yield f"data: {json.dumps({'type': 'transcription', 'text': transcription})}\n\n"

            screenshot = await capture_screenshot_b64(session_id=str(session_id))
            if not screenshot:
                no_screen_msg = "I don't have a browser screen to describe right now. Start a browser task first, then ask me to describe what I see."
                yield f"data: {json.dumps({'type': 'delta', 'text': no_screen_msg})}\n\n"
                async with AsyncSessionLocal() as db2:
                    msg = await add_message(db2, session_id, "assistant", no_screen_msg)
                yield f"data: {json.dumps({'type': 'done', 'message_id': str(msg.id), 'task_prompt': None, 'task_id': None})}\n\n"
                return

            loop = asyncio.get_running_loop()
            queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()

            def producer():
                try:
                    for delta in stream_describe_screenshot(screenshot, transcription):
                        asyncio.run_coroutine_threadsafe(queue.put(("delta", delta)), loop)
                    asyncio.run_coroutine_threadsafe(queue.put(("done", "")), loop)
                except Exception as exc:
                    asyncio.run_coroutine_threadsafe(queue.put(("error", str(exc))), loop)

            threading.Thread(target=producer, daemon=True).start()

            full_text = ""
            while True:
                if await request.is_disconnected():
                    break
                kind, value = await queue.get()
                if kind == "delta":
                    full_text += value
                    yield f"data: {json.dumps({'type': 'delta', 'text': value})}\n\n"
                elif kind == "error":
                    yield f"data: {json.dumps({'type': 'error', 'message': value})}\n\n"
                    break
                elif kind == "done":
                    async with AsyncSessionLocal() as db2:
                        msg = await add_message(db2, session_id, "assistant", full_text)
                    yield f"data: {json.dumps({'type': 'done', 'message_id': str(msg.id), 'task_prompt': None, 'task_id': None})}\n\n"
                    break

        return StreamingResponse(describe_audio_stream(), media_type="text/event-stream")

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

                # Store assistant message in Zep and extract memory facts
                if zep:
                    zep.add_message("assistant", assistant_text)
                    async def _extract_to_zep():
                        try:
                            facts = await extract_memory_facts(
                                messages=[
                                    {"role": "user", "content": audio_user_content},
                                    {"role": "assistant", "content": assistant_text},
                                ],
                                existing_context=zep_ctx,
                                user_name=str(settings.zep_user_name or "User"),
                            )
                            if facts:
                                zep.store_extracted_facts(facts)
                        except Exception:
                            logger.exception("Zep memory extraction failed")

                    asyncio.create_task(_extract_to_zep())

                task_id = None
                async with AsyncSessionLocal() as db2:
                    session_row = await db2.get(SessionModel, str(session_id))
                    if session_row:
                        # Auto-title: set to first user message (truncated) if no title yet
                        if not session_row.title:
                            session_row.title = audio_user_content[:50]

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

                # Background fact extraction - only if Zep is NOT configured
                if not settings.zep_api_key:
                    asyncio.create_task(extract_and_store_facts(audio_user_content, assistant_text, session_id=str(session_id)))

                # Start task in background AFTER response is sent
                if task_id and task_prompt:
                    asyncio.create_task(execute_task_background(str(task_id), str(session_id), task_prompt))

                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")



@router.get("/{session_id}/messages/events")
async def message_events_endpoint(session_id: UUID):
    """
    SSE endpoint for real-time message notifications.

    Clients subscribe to this endpoint to receive notifications when new messages
    are added to the session outside of the normal request/response cycle
    (e.g., auto-generated summaries after task completion).

    Events:
    - message_created: A new message was added to the session
    - keepalive: Periodic keepalive to prevent connection timeout
    """
    async def event_generator():
        async for event_data in message_event_stream(str(session_id)):
            if event_data.get("type") == "keepalive":
                yield {"event": "keepalive", "data": ""}
            else:
                yield {"event": "message_created", "data": json.dumps(event_data)}

    return EventSourceResponse(event_generator())
