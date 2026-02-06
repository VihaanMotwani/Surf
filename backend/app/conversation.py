from datetime import datetime, timezone

from app.crud import add_message, create_task, list_messages
from app.llm import generate_assistant_text, parse_task_prompt
from app.models import Session
from app.schemas import ChatResponse, MessageResponse
from sqlalchemy.ext.asyncio import AsyncSession


CONFIRM_WORDS = {
    "yes",
    "y",
    "confirm",
    "confirmed",
    "ok",
    "okay",
    "sure",
    "do it",
    "run it",
    "go ahead",
    "proceed",
}

DENY_WORDS = {
    "no",
    "nope",
    "cancel",
    "stop",
    "never mind",
    "nevermind",
}


def _is_confirmation(text: str) -> bool:
    normalized = " ".join(text.strip().lower().split())
    return normalized in CONFIRM_WORDS


def _is_denial(text: str) -> bool:
    normalized = " ".join(text.strip().lower().split())
    return normalized in DENY_WORDS


async def maybe_handle_confirmation(db: AsyncSession, session: Session, content: str) -> ChatResponse | None:
    if session.status == "task_running":
        assistant_text = "A task is already running. Please wait for it to finish."
        msg = await add_message(db, session.id, "assistant", assistant_text)
        assistant_msg = MessageResponse(id=msg.id, role=msg.role, content=msg.content, created_at=msg.created_at)
        return ChatResponse(assistant_message=assistant_msg, task_id=None)

    if session.status == "awaiting_confirmation" and _is_denial(content):
        session.status = "idle"
        session.pending_task_prompt = None
        session.updated_at = datetime.now(timezone.utc)
        await db.commit()
        assistant_text = "Okay, canceled. Tell me what you'd like to do next."
        msg = await add_message(db, session.id, "assistant", assistant_text)
        assistant_msg = MessageResponse(id=msg.id, role=msg.role, content=msg.content, created_at=msg.created_at)
        return ChatResponse(assistant_message=assistant_msg, task_id=None)

    if session.status == "awaiting_confirmation" and _is_confirmation(content):
        prompt = session.pending_task_prompt or content
        task = await create_task(db, session, prompt)
        assistant_text = f"Starting the task: {prompt}"
        msg = await add_message(db, session.id, "assistant", assistant_text)
        assistant_msg = MessageResponse(id=msg.id, role=msg.role, content=msg.content, created_at=msg.created_at)
        return ChatResponse(assistant_message=assistant_msg, task_id=task.id)

    return None


async def handle_user_message(db: AsyncSession, session: Session, content: str) -> ChatResponse:
    await add_message(db, session.id, "user", content)

    maybe_response = await maybe_handle_confirmation(db, session, content)
    if maybe_response:
        return maybe_response

    messages = await list_messages(db, session.id)
    try:
        assistant_text = await generate_assistant_text(messages)
    except Exception:
        assistant_text = "I ran into an error generating a response. Please try again."
    assistant_text, task_prompt = parse_task_prompt(assistant_text)

    if task_prompt:
        session.status = "awaiting_confirmation"
        session.pending_task_prompt = task_prompt
    else:
        session.status = "idle"
        session.pending_task_prompt = None
    session.updated_at = datetime.now(timezone.utc)
    await db.commit()
    msg = await add_message(db, session.id, "assistant", assistant_text)
    assistant_msg = MessageResponse(id=msg.id, role=msg.role, content=msg.content, created_at=msg.created_at)
    return ChatResponse(assistant_message=assistant_msg, task_id=None)
