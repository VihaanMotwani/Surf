import asyncio
import logging
from datetime import datetime, timezone

from app.db import AsyncSessionLocal
from app.models import Artifact, Session, Task, TaskEvent
from worker.runner import run_browser_use_task, summarize_history, to_jsonable

logger = logging.getLogger(__name__)


async def _finalize_success(task_id: str, session_id: str, history):
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


async def execute_task_background(task_id: str, session_id: str, prompt: str):
    """Run a browser-use task in-process and finalize results in DB."""
    # Mark task as running
    async with AsyncSessionLocal() as db:
        async with db.begin():
            task = await db.get(Task, task_id)
            if task:
                task.status = "running"
                task.started_at = datetime.now(timezone.utc)
                db.add(TaskEvent(task_id=task_id, type="status", payload={"status": "running"}))

    try:
        history = await run_browser_use_task(prompt)
        await _finalize_success(task_id, session_id, history)
    except Exception as exc:
        logger.exception("Task %s failed", task_id)
        await _finalize_failure(task_id, session_id, str(exc))
