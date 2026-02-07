import asyncio
import logging
from datetime import datetime, timezone

from app.db import AsyncSessionLocal
from app.models import Artifact, Session, Task, TaskEvent
from worker.runner import run_browser_use_task, summarize_history, to_jsonable
from app.uploads import list_uploads

logger = logging.getLogger(__name__)

# Track active browser instance for screenshot capture
_active_browser = None

# Track browser instances per session to reuse across tasks
_session_browsers = {}  # session_id -> browser
_session_browser_context = {}  # session_id -> last browser state info


async def capture_screenshot_b64(session_id: str | None = None) -> str | None:
    """Capture a screenshot from the active browser, or return the latest artifact screenshot."""
    global _active_browser, _session_browsers

    # First try: currently active browser (task is running)
    if _active_browser is not None:
        try:
            pages = await _active_browser.get_pages()
            if pages:
                page = pages[-1]
                screenshot_b64 = await page.screenshot()  # Already returns base64 string
                return screenshot_b64
        except Exception as exc:
            logger.warning(f"Failed to capture screenshot from active browser: {exc}")

    # Second try: browser for this session (browser is open but task finished)
    if session_id:
        browser = _session_browsers.get(session_id)
        if browser is not None:
            try:
                pages = await browser.get_pages()
                if pages:
                    page = pages[-1]
                    screenshot_b64 = await page.screenshot()  # Already returns base64 string
                    logger.info(f"Captured screenshot from session browser {session_id}")
                    return screenshot_b64
            except Exception as exc:
                logger.warning(f"Failed to capture screenshot from session browser {session_id}: {exc}")

    # Third try: get most recent screenshot artifact from DB
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        stmt = (
            select(Artifact)
            .where(Artifact.type == "screenshot")
            .order_by(Artifact.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        artifact = result.scalar_one_or_none()
        if artifact and artifact.data:
            return artifact.data
    return None


async def _finalize_success(task_id: str, session_id: str, history, skip_summary: bool = False):
    payload = None
    async with AsyncSessionLocal() as db:
        async with db.begin():
            task = await db.get(Task, task_id)
            if not task:
                return
            task.status = "succeeded"
            task.finished_at = datetime.now(timezone.utc)

            payload = to_jsonable(summarize_history(history))
            db.add(TaskEvent(task_id=task_id, type="result", payload=payload))

            try:
                screenshots = history.screenshots()
                for shot in screenshots:
                    db.add(Artifact(task_id=task_id, type="screenshot", data=shot))
            except Exception:
                db.add(
                    TaskEvent(
                        task_id=task_id,
                        type="warning",
                        payload={"message": "Failed to capture screenshots"},
                    )
                )

            db.add(TaskEvent(task_id=task_id, type="status", payload={"status": "succeeded"}))

            session = await db.get(Session, session_id)
            if session:
                session.status = "task_completed"

    # Generate summary after DB commit completes (skip for Realtime API)
    if not skip_summary:
        await _generate_completion_summary(task_id, session_id, payload)


async def _generate_completion_summary(task_id: str, session_id: str, result_summary: dict):
    """
    Generate and store an assistant message summarizing task completion.

    This runs after a task succeeds to provide automatic feedback to the user.
    Uses the LLM to create natural, context-aware summaries with follow-up suggestions.
    """
    from app.conversation import create_assistant_message_for_task_completion

    try:
        await create_assistant_message_for_task_completion(
            session_id=session_id,
            task_result=result_summary,
            task_id=task_id
        )
        logger.info(f"Generated completion summary for task {task_id}")
    except Exception as e:
        logger.error(f"Failed to generate completion summary for task {task_id}: {e}", exc_info=True)
        # Don't fail the task if summary generation fails - it's a nice-to-have


async def _finalize_failure(task_id: str, session_id: str, error_message: str):
    async with AsyncSessionLocal() as db:
        async with db.begin():
            task = await db.get(Task, task_id)
            if not task:
                return
            task.status = "failed"
            task.error = error_message
            task.finished_at = datetime.now(timezone.utc)

            db.add(TaskEvent(task_id=task_id, type="error", payload={"message": error_message}))
            db.add(TaskEvent(task_id=task_id, type="status", payload={"status": "failed"}))

            session = await db.get(Session, session_id)
            if session:
                session.status = "task_completed"


async def _emit_event(task_id: str, event_type: str, payload: dict):
    """Emit a task event to the database for streaming to frontend."""
    async with AsyncSessionLocal() as db:
        async with db.begin():
            db.add(TaskEvent(task_id=task_id, type=event_type, payload=payload))


async def execute_task_background(
    task_id: str, 
    session_id: str, 
    prompt: str,
    on_step_callback=None,
    skip_summary: bool = False
):
    """Run a browser-use task in-process and finalize results in DB.
    
    Args:
        task_id: The task ID
        session_id: The session ID
        prompt: The task prompt
        on_step_callback: Optional async callback for each step (receives step_data dict)
        skip_summary: If True, skip generating the LLM summary (e.g. for Realtime API)
    """
    # Mark task as running
    async with AsyncSessionLocal() as db:
        async with db.begin():
            task = await db.get(Task, task_id)
            if task:
                task.status = "running"
                task.started_at = datetime.now(timezone.utc)
                db.add(TaskEvent(task_id=task_id, type="status", payload={"status": "running"}))

    global _active_browser, _session_browsers

    # Reuse or create browser for this session
    browser = _session_browsers.get(session_id)
    if browser is None:
        try:
            from browser_use import Browser
            browser = Browser(keep_alive=True)  # Prevent agent from closing the browser
            await browser.start()
            _session_browsers[session_id] = browser
            logger.info(f"Created new browser for session {session_id}")
        except Exception as exc:
            logger.exception("Failed to start browser for session %s", session_id)
            await _finalize_failure(task_id, session_id, f"Failed to start browser: {exc}")
            return
    else:
        logger.info(f"Reusing browser for session {session_id}")

    _active_browser = browser
    try:
        # Get previous browser context for this session
        previous_context = _session_browser_context.get(session_id, "")

        # Enrich prompt with browser context if this is a follow-up task
        enriched_prompt = prompt
        if previous_context:
            enriched_prompt = f"{previous_context}\n\n---\nNEW TASK: {prompt}"
            logger.info(f"Enriched task with previous browser context for session {session_id}")

        # Add available file uploads for this session (if any)
        uploads = list_uploads(session_id)
        available_file_paths = None
        if uploads:
            uploads_lines = "\n".join(
                f"- {u['filename']}: {u['path']}" for u in uploads
            )
            enriched_prompt += (
                "\n\nFILES AVAILABLE FOR UPLOAD:\n"
                f"{uploads_lines}\n"
                "Use the upload_file action with the full file path above when a file upload is required."
            )
            available_file_paths = [u["path"] for u in uploads]

        # Define step callback - emit to DB and optionally call custom callback
        async def step_handler(step_data):
            await _emit_event(task_id, "step", step_data)
            if on_step_callback:
                await on_step_callback(step_data)

        logger.info(f"Executing task {task_id} with browser for session {session_id}")
        history = await run_browser_use_task(
            enriched_prompt,
            browser=browser,  # Pass existing browser to reuse it
            on_step_callback=lambda step_data: asyncio.create_task(step_handler(step_data)),
            available_file_paths=available_file_paths,
        )

        # Store browser context for next task in this session
        if history:
            try:
                # Get current page state
                pages = await browser.get_pages()
                if pages:
                    page = pages[-1]
                    current_url = page.url if hasattr(page, 'url') else "unknown"
                    context = f"BROWSER CONTEXT: You are continuing work in a browser that is still open.\nCurrent URL: {current_url}\nPrevious task result: {history.final_result()}"
                    _session_browser_context[session_id] = context
            except Exception as e:
                logger.warning(f"Failed to capture browser context: {e}")

        logger.info(f"Task {task_id} completed successfully, browser remains alive for session {session_id}")
        await _finalize_success(task_id, session_id, history, skip_summary=skip_summary)
    except Exception as exc:
        logger.exception("Task %s failed", task_id)
        await _finalize_failure(task_id, session_id, str(exc))
    finally:
        _active_browser = None
        # Don't close browser here - keep it alive for next task in same session
        logger.info(f"Browser for session {session_id} kept alive (total sessions: {len(_session_browsers)})")


async def close_session_browser(session_id: str):
    """Close and cleanup browser when session is deleted or ended."""
    global _session_browsers, _session_browser_context
    browser = _session_browsers.pop(session_id, None)
    _session_browser_context.pop(session_id, None)  # Also clear context
    if browser:
        try:
            await browser.stop()
            logger.info(f"Closed browser for session {session_id}")
        except Exception as exc:
            logger.warning(f"Failed to close browser for session {session_id}: {exc}")
