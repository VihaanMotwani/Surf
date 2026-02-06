from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Artifact, Message, Session, Task, TaskEvent


async def create_session(db: AsyncSession) -> Session:
    session = Session()
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def get_session(db: AsyncSession, session_id: str) -> Session | None:
    result = await db.execute(select(Session).where(Session.id == str(session_id)))
    return result.scalar_one_or_none()


async def list_sessions(db: AsyncSession) -> list[dict]:
    """Return all sessions with message counts, ordered by updated_at DESC."""
    stmt = (
        select(
            Session,
            func.count(Message.id).label("message_count"),
        )
        .outerjoin(Message, Message.session_id == Session.id)
        .group_by(Session.id)
        .order_by(Session.updated_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "id": row.Session.id,
            "title": row.Session.title,
            "status": row.Session.status,
            "message_count": row.message_count,
            "created_at": row.Session.created_at,
            "updated_at": row.Session.updated_at,
        }
        for row in rows
    ]


async def delete_session(db: AsyncSession, session_id: str) -> bool:
    session = await get_session(db, session_id)
    if not session:
        return False
    await db.delete(session)
    await db.commit()
    return True


async def add_message(db: AsyncSession, session_id: str, role: str, content: str) -> Message:
    message = Message(session_id=str(session_id), role=role, content=content)
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


async def list_messages(db: AsyncSession, session_id: str) -> list[Message]:
    result = await db.execute(select(Message).where(Message.session_id == str(session_id)).order_by(Message.created_at))
    return list(result.scalars().all())


async def create_task(db: AsyncSession, session: Session, prompt: str) -> Task:
    task = Task(
        session_id=session.id,
        status="queued",
        prompt=prompt,
        agreed_at=datetime.now(timezone.utc),
    )
    session.status = "task_running"
    session.pending_task_prompt = None
    db.add(task)
    await db.flush()  # Generate task.id before referencing it
    db.add(TaskEvent(task_id=task.id, type="status", payload={"status": "queued"}))
    await db.commit()
    await db.refresh(task)
    return task


async def get_task(db: AsyncSession, task_id: str) -> Task | None:
    result = await db.execute(select(Task).where(Task.id == str(task_id)))
    return result.scalar_one_or_none()


async def add_task_event(db: AsyncSession, task_id: str, type_: str, payload: dict) -> TaskEvent:
    event = TaskEvent(task_id=str(task_id), type=type_, payload=payload)
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


async def list_task_events(
    db: AsyncSession, task_id: str, after_id: int | None = None, limit: int = 200
) -> list[TaskEvent]:
    stmt = select(TaskEvent).where(TaskEvent.task_id == str(task_id))
    if after_id is not None:
        stmt = stmt.where(TaskEvent.id > after_id)
    stmt = stmt.order_by(TaskEvent.id).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_artifacts(db: AsyncSession, task_id: str) -> list[Artifact]:
    result = await db.execute(select(Artifact).where(Artifact.task_id == str(task_id)))
    return list(result.scalars().all())


async def get_latest_task_result(db: AsyncSession, session_id: str) -> dict | None:
    """Return the result payload of the most recently completed task in a session."""
    stmt = (
        select(Task)
        .where(Task.session_id == str(session_id))
        .where(Task.status.in_(["succeeded", "failed"]))
        .order_by(Task.finished_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()
    if not task:
        return None

    # Get the result event
    evt_stmt = (
        select(TaskEvent)
        .where(TaskEvent.task_id == task.id)
        .where(TaskEvent.type.in_(["result", "error"]))
        .order_by(TaskEvent.id.desc())
        .limit(1)
    )
    evt_result = await db.execute(evt_stmt)
    event = evt_result.scalar_one_or_none()

    return {
        "task_id": task.id,
        "status": task.status,
        "prompt": task.prompt,
        "error": task.error,
        "payload": event.payload if event else {},
    }
