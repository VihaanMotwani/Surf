import asyncio
import logging
from datetime import datetime, timezone

from app.config import settings
from app.crud import add_message, create_task, list_messages
from app.llm import generate_assistant_text, parse_task_prompt
from app.local_memory import extract_and_store_facts, get_memory_context as get_local_memory_context
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


async def check_task_running(db: AsyncSession, session: Session) -> ChatResponse | None:
    """Return an early response if a task is already running."""
    if session.status == "task_running":
        assistant_text = "A task is already running. Please wait for it to finish."
        msg = await add_message(db, session.id, "assistant", assistant_text)
        assistant_msg = MessageResponse(id=msg.id, role=msg.role, content=msg.content, created_at=msg.created_at)
        return ChatResponse(assistant_message=assistant_msg, task_id=None)
    return None


async def handle_user_message(db: AsyncSession, session: Session, content: str) -> ChatResponse:
    await add_message(db, session.id, "user", content)

    # Store user message in Zep
    zep = _get_zep()
    if zep:
        zep.add_message("user", content)

    running = await check_task_running(db, session)
    if running:
        return running

    # Fetch memory context for LLM enrichment (always include local facts)
    local_ctx = await get_local_memory_context()
    zep_ctx = zep.get_context() if zep else ""

    # Add browser session context if a browser is open for this session
    from app.task_executor import _session_browser_context
    browser_ctx = _session_browser_context.get(str(session.id), "")

    memory_context = "\n\n".join(filter(None, [zep_ctx, local_ctx, browser_ctx]))

    messages = await list_messages(db, session.id)
    try:
        assistant_text = await generate_assistant_text(messages, memory_context=memory_context)
    except Exception:
        assistant_text = "I ran into an error generating a response. Please try again."
    assistant_text, task_prompt = parse_task_prompt(assistant_text)

    # Store assistant message in Zep
    if zep:
        zep.add_message("assistant", assistant_text)

    task_id = None
    if task_prompt:
        task = await create_task(db, session, task_prompt)
        task_id = task.id
        asyncio.create_task(execute_task_background(str(task.id), str(task.session_id), task_prompt))
    else:
        session.status = "idle"
        session.pending_task_prompt = None
        session.updated_at = datetime.now(timezone.utc)
        await db.commit()

    msg = await add_message(db, session.id, "assistant", assistant_text)

    # Background fact extraction (fire-and-forget)
    asyncio.create_task(extract_and_store_facts(content, assistant_text, session_id=str(session.id)))

    assistant_msg = MessageResponse(id=msg.id, role=msg.role, content=msg.content, created_at=msg.created_at)
    return ChatResponse(assistant_message=assistant_msg, task_id=task_id)
