import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app.config import settings
from app.db import AsyncSessionLocal
from app.models import Artifact, Session, Task, TaskEvent
from worker.runner import run_browser_use_task, summarize_history, to_jsonable


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
    while True:
        claimed = await claim_task()
        if not claimed:
            await asyncio.sleep(settings.task_poll_interval)
            continue

        task_id, prompt, session_id = claimed
        try:
            history = await run_browser_use_task(prompt)
            await finalize_task_success(task_id, session_id, history)
        except Exception as exc:
            await finalize_task_failure(task_id, session_id, str(exc))


if __name__ == "__main__":
    asyncio.run(worker_loop())
