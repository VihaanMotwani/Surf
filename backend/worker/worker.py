import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.config import settings
from app.db import AsyncSessionLocal
from app.models import Artifact, Session, Task, TaskEvent
from worker.runner import run_browser_use_task, summarize_history, to_jsonable

logger = logging.getLogger(__name__)

# Track browser instances per session to reuse across tasks
_session_browsers = {}  # session_id -> browser
_session_browser_context = {}  # session_id -> last browser state info


async def claim_task():
    async with AsyncSessionLocal() as db:
        async with db.begin():
            stmt = (
                select(Task)
                .where(Task.status == "queued")
                .order_by(Task.created_at)
                .limit(settings.task_claim_limit)
            )
            result = await db.execute(stmt)
            task = result.scalar_one_or_none()
            if not task:
                return None

            task.status = "running"
            task.started_at = datetime.now(timezone.utc)
            db.add(TaskEvent(task_id=task.id, type="status", payload={"status": "running"}))

            session = await db.get(Session, task.session_id)
            if session:
                session.status = "task_running"

            await db.flush()
            return task.id, task.prompt, task.session_id


async def finalize_task_success(task_id, session_id, history):
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
                    db.add(
                        Artifact(
                            task_id=task_id,
                            type="screenshot",
                            data=shot,
                        )
                    )
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


async def finalize_task_failure(task_id, session_id, error_message: str):
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


async def worker_loop():
    global _session_browsers
    while True:
        claimed = await claim_task()
        if not claimed:
            await asyncio.sleep(settings.task_poll_interval)
            continue

        task_id, prompt, session_id = claimed

        # Reuse or create browser for this session
        browser = _session_browsers.get(session_id)
        if browser is None:
            try:
                from browser_use import Browser
                browser = Browser(keep_alive=True)  # Prevent agent from closing the browser
                await browser.start()
                _session_browsers[session_id] = browser
                logger.info(f"Worker: Created new browser for session {session_id}")
            except Exception as exc:
                logger.exception("Worker: Failed to start browser for session %s", session_id)
                await finalize_task_failure(task_id, session_id, f"Failed to start browser: {exc}")
                continue
        else:
            logger.info(f"Worker: Reusing browser for session {session_id}")

        try:
            # Get previous browser context for this session
            previous_context = _session_browser_context.get(session_id, "")

            # Enrich prompt with browser context if this is a follow-up task
            enriched_prompt = prompt
            if previous_context:
                enriched_prompt = f"{previous_context}\n\n---\nNEW TASK: {prompt}"
                logger.info(f"Worker: Enriched task with previous browser context for session {session_id}")

            history = await run_browser_use_task(enriched_prompt, browser=browser)  # Pass browser to reuse it

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
                    logger.warning(f"Worker: Failed to capture browser context: {e}")

            await finalize_task_success(task_id, session_id, history)
        except Exception as exc:
            logger.exception("Worker: Task %s failed", task_id)
            await finalize_task_failure(task_id, session_id, str(exc))
        # Don't close browser here - keep it alive for next task in same session


async def close_session_browser_worker(session_id: str):
    """Close and cleanup browser when session is deleted or ended (worker version)."""
    global _session_browsers, _session_browser_context
    browser = _session_browsers.pop(session_id, None)
    _session_browser_context.pop(session_id, None)  # Also clear context
    if browser:
        try:
            await browser.stop()
            logger.info(f"Worker: Closed browser for session {session_id}")
        except Exception as exc:
            logger.warning(f"Worker: Failed to close browser for session {session_id}: {exc}")


if __name__ == "__main__":
    asyncio.run(worker_loop())
