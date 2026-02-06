import asyncio
import logging
from datetime import datetime, timezone

from app.config import settings
from app.crud import add_message, create_task, list_messages
from app.llm import generate_assistant_text, parse_task_prompt
from app.memory import ZepMemory, create_memory
from app.models import Session
from app.schemas import ChatResponse, MessageResponse
from app.task_executor import execute_task_background
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Module-level Zep memory instance (None when Zep is not configured)
_zep: ZepMemory | None = None
_zep_initialized = False


def _get_zep() -> ZepMemory | None:
    """Lazy-init the Zep memory singleton."""
    global _zep, _zep_initialized
    if not _zep_initialized:
        _zep = create_memory(
            api_key=settings.zep_api_key,
            user_id=settings.zep_user_id,
            user_name=settings.zep_user_name,
        )
        _zep_initialized = True
    return _zep


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
        asyncio.create_task(execute_task_background(str(task.id), str(task.session_id), prompt))
        assistant_text = f"Starting the task: {prompt}"
        msg = await add_message(db, session.id, "assistant", assistant_text)
        assistant_msg = MessageResponse(id=msg.id, role=msg.role, content=msg.content, created_at=msg.created_at)
        return ChatResponse(assistant_message=assistant_msg, task_id=task.id)

    return None


async def handle_user_message(db: AsyncSession, session: Session, content: str) -> ChatResponse:
    await add_message(db, session.id, "user", content)

    # Store user message in Zep
    zep = _get_zep()
    if zep:
        zep.add_message("user", content)

    maybe_response = await maybe_handle_confirmation(db, session, content)
    if maybe_response:
        return maybe_response

    # Fetch Zep context for LLM enrichment
    memory_context = zep.get_context() if zep else ""

    messages = await list_messages(db, session.id)
    try:
        assistant_text = await generate_assistant_text(messages, memory_context=memory_context)
    except Exception:
        assistant_text = "I ran into an error generating a response. Please try again."
    assistant_text, task_prompt = parse_task_prompt(assistant_text)

    # Store assistant message in Zep
    if zep:
        zep.add_message("assistant", assistant_text)

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
