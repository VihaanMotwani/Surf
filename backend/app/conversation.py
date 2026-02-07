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


async def create_assistant_message_for_task_completion(
    session_id: str,
    task_result: dict,
    task_id: str
) -> None:
    """
    Create an assistant message summarizing task completion.

    This is called automatically after a task succeeds to provide
    user-friendly feedback about what was accomplished and suggest next steps.

    Args:
        session_id: The session ID
        task_result: The summarized task history from summarize_history()
        task_id: The completed task ID
    """
    from app.db import AsyncSessionLocal
    from app.llm import generate_text_from_prompt

    # Build the prompt for LLM to generate summary
    prompt = _build_completion_summary_prompt(task_result)

    # Generate summary text using LLM
    summary_text = await generate_text_from_prompt(prompt)

    # Store the message in the database
    async with AsyncSessionLocal() as db:
        # add_message handles its own commit, so don't use db.begin()
        msg = await add_message(db, session_id, "assistant", summary_text)
        logger.info(f"Created task completion summary message {msg.id} for task {task_id}")

        # Update session status back to idle since task is complete
        session = await db.get(Session, session_id)
        if session:
            session.status = "idle"
            session.updated_at = datetime.now(timezone.utc)
            await db.commit()

    # Broadcast message event to UI
    from app.message_events import broadcast_message_event
    broadcast_message_event(session_id, {
        "type": "message_created",
        "message_id": str(msg.id),
        "role": "assistant",
        "content": summary_text,
        "created_at": msg.created_at.isoformat(),
        "is_auto_summary": True,
        "task_id": task_id
    })

    # Trigger TTS for the summary (fire and forget)
    asyncio.create_task(_synthesize_and_broadcast_audio(session_id, summary_text, str(msg.id)))


async def _synthesize_and_broadcast_audio(session_id: str, text: str, message_id: str):
    """
    Synthesize speech for auto-summary and broadcast audio URL to UI.

    This is a fire-and-forget function that generates TTS audio and notifies
    the frontend when it's ready to play.
    """
    try:
        from openai import AsyncOpenAI
        from app.config import settings
        import base64

        if not settings.openai_api_key:
            logger.warning("OpenAI API key not configured, skipping TTS for auto-summary")
            return

        client = AsyncOpenAI(api_key=settings.openai_api_key)

        # Generate speech using OpenAI TTS
        response = await client.audio.speech.create(
            model="tts-1",
            voice="nova",  # Default voice for summaries
            input=text,
            speed=1.0,
            response_format="mp3"
        )

        # Get audio content and encode as base64
        audio_content = response.content
        audio_b64 = base64.b64encode(audio_content).decode('utf-8')

        # Broadcast audio event to UI
        from app.message_events import broadcast_message_event
        broadcast_message_event(session_id, {
            "type": "audio_ready",
            "message_id": message_id,
            "audio_b64": audio_b64,
            "format": "mp3"
        })

        logger.info(f"Generated and broadcasted TTS audio for message {message_id}")

    except Exception as e:
        logger.error(f"Failed to synthesize speech for auto-summary: {e}", exc_info=True)
        # Don't fail the summary creation if TTS fails


def _build_completion_summary_prompt(task_result: dict) -> str:
    """
    Build a prompt for the LLM to generate a natural task completion summary.

    Based on user preferences:
    - Detailed with key actions
    - Only mention errors if they impacted results
    - Context-specific follow-up suggestions
    """
    final_result = task_result.get("final_result", "")
    steps = task_result.get("steps", [])
    urls = task_result.get("urls", [])
    errors = task_result.get("errors", [])
    extracted_content = task_result.get("extracted_content", [])
    num_steps = task_result.get("number_of_steps", len(steps))

    # Format key actions from steps (limit to 5 most important)
    key_actions = []
    for i, step in enumerate(steps[:5]):
        action_summary = f"Step {i+1}: {step.get('next_goal', 'Performed action')}"
        key_actions.append(action_summary)

    actions_text = "\n".join(key_actions) if key_actions else "No specific actions logged"

    # Only include errors if they seem significant
    error_context = ""
    if errors and len(errors) > 2:  # Only mention if multiple errors
        error_context = f"\nNote: There were {len(errors)} errors during execution, which may have impacted the results."

    # Format extracted content summary
    content_summary = ""
    if extracted_content:
        content_summary = f"\nExtracted content: {len(extracted_content)} items"

    prompt = f"""You just completed a browser automation task. Generate a friendly summary message for the user.

TASK RESULT:
{final_result}

KEY ACTIONS TAKEN ({num_steps} total steps):
{actions_text}

URLS VISITED:
{', '.join(urls[:3]) if urls else 'None'}
{f'...and {len(urls) - 3} more' if len(urls) > 3 else ''}
{content_summary}
{error_context}

INSTRUCTIONS:
1. Write a 2-3 sentence summary of what was accomplished
2. Include 1-2 specific details about key actions or findings (e.g., "I navigated to the pricing page and extracted 5 data points")
3. Keep it conversational but informative
4. End with a context-specific follow-up question based on what was done
   - Examples: "Would you like me to extract more details from that page?", "Should I check the other sections too?", "Would you like me to search for similar information elsewhere?"
   - Make the suggestion relevant to the task that was just completed

Generate ONLY the message text. Do not include labels like "Summary:" or "Follow-up:". Write it as a single natural response."""

    return prompt
