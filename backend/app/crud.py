from datetime import datetime, timezone

from sqlalchemy import select
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
