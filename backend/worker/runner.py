import json
import logging
from typing import Any

from dotenv import load_dotenv

from browser_use import Agent, Browser, ChatBrowserUse

from app.config import settings
from app.memory import ZepMemory, create_memory

load_dotenv()

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


def to_jsonable(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))


async def run_browser_use_task(task_prompt: str):
    # Enrich the task prompt with Zep memory context
    zep = _get_zep()
    enriched_prompt = task_prompt
    if zep:
        context = zep.get_context()
        if context:
            enriched_prompt = f"{context}\n\n---\nCURRENT TASK: {task_prompt}"

    browser = Browser()
    await browser.start()
    try:
        llm = ChatBrowserUse()
        agent = Agent(task=enriched_prompt, llm=llm, browser=browser)
        history = await agent.run()

        # Store browser result in Zep
        if zep:
            final_result = history.final_result() if history else ""
            zep.store_browser_result(
                task=task_prompt,
                result=str(final_result) if final_result else "Task completed",
                success=True,
            )

        return history
    except Exception:
        if zep:
            zep.store_browser_result(task=task_prompt, result="", success=False)
        raise
    finally:
        await browser.stop()


def summarize_history(history) -> dict[str, Any]:
    return {
        "urls": history.urls(),
        "actions": history.action_history(),
        "errors": history.errors(),
        "final_result": history.final_result(),
        "total_duration_seconds": history.total_duration_seconds(),
        "number_of_steps": history.number_of_steps(),
    }
