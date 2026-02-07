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


async def run_browser_use_task(task_prompt: str, browser: Browser | None = None, on_step_callback=None):
    # Enrich the task prompt with Zep memory context
    zep = _get_zep()
    enriched_prompt = task_prompt
    if zep:
        context = zep.get_context()
        if context:
            enriched_prompt = f"{context}\n\n---\nCURRENT TASK: {task_prompt}"

    owns_browser = browser is None
    if owns_browser:
        browser = Browser()
        await browser.start()
    try:
        llm = ChatBrowserUse()
        agent = Agent(
            task=enriched_prompt,
            llm=llm,
            browser=browser,
            use_thinking=True  # Enable chain of thought
        )

        # Wrap the agent to stream steps if callback provided
        if on_step_callback:
            history = await _run_with_streaming(agent, on_step_callback)
        else:
            history = await agent.run()

        return history
    except Exception:
        # if zep:
        #     zep.store_browser_result(task=task_prompt, result="", success=False)
        raise
    finally:
        if owns_browser:
            await browser.stop()


async def _run_with_streaming(agent, on_step_callback):
    """Run the agent and stream step-by-step updates via callback."""
    step_count = [0]  # Use list to allow mutation in nested function

    async def on_step_end_handler(agent):
        """Called by browser-use after each step completes."""
        try:
            history = agent.history
            i = step_count[0]
            step_count[0] += 1

            if i >= len(history.history):
                return

            step = history.history[i]
            step_data = {
                "step": i + 1,
                "url": getattr(step.state, "url", None) if step.state else None,
                "page_title": getattr(step.state, "title", None) if step.state else None,
            }

            # Extract chain of thought (thinking)
            if step.model_output and step.model_output.thinking:
                step_data["thinking"] = step.model_output.thinking

            # Extract thought/evaluation from model_thoughts
            try:
                thoughts = history.model_thoughts()
                if i < len(thoughts) and thoughts[i]:
                    thought = thoughts[i]
                    step_data["evaluation"] = getattr(thought, "evaluation_previous_goal", None)
                    step_data["next_goal"] = getattr(thought, "next_goal", None)
                    step_data["memory"] = getattr(thought, "memory", None)
            except Exception:
                pass

            # Add actions
            if step.model_output and step.model_output.action:
                actions = []
                for action in step.model_output.action:
                    try:
                        actions.append(action.model_dump(exclude_none=True))
                    except Exception:
                        actions.append(str(action))
                step_data["actions"] = actions

            # Emit this step in real-time
            if on_step_callback:
                logger.info(f"Emitting step {i + 1} to frontend: {step_data.get('next_goal', 'N/A')}")
                on_step_callback(step_data)
        except Exception as exc:
            logger.warning("Failed to emit step: %s", exc)

    # Run the agent with the real-time step callback
    history = await agent.run(on_step_end=on_step_end_handler)

    return history


def summarize_history(history) -> dict[str, Any]:
    """Build a rich summary from browser-use AgentHistoryList."""
    # Step-by-step breakdown with thoughts, actions, and results
    steps = []
    try:
        thoughts = history.model_thoughts()

        for i, item in enumerate(history.history):
            step: dict[str, Any] = {"step": i + 1}

            # Page context
            if item.state:
                step["url"] = getattr(item.state, "url", None)
                step["page_title"] = getattr(item.state, "title", None)

            # Chain of thought (thinking)
            if item.model_output and item.model_output.thinking:
                step["thinking"] = item.model_output.thinking

            # Agent's thinking from model_thoughts
            if i < len(thoughts) and thoughts[i]:
                thought = thoughts[i]
                step["evaluation"] = getattr(thought, "evaluation_previous_goal", None)
                step["memory"] = getattr(thought, "memory", None)
                step["next_goal"] = getattr(thought, "next_goal", None)

            # Actions taken in this step
            if item.model_output and item.model_output.action:
                step_actions = []
                for action in item.model_output.action:
                    try:
                        action_dict = action.model_dump(exclude_none=True)
                        step_actions.append(action_dict)
                    except Exception:
                        step_actions.append(str(action))
                step["actions"] = step_actions

            # Results from this step
            if item.result:
                step_results = []
                for r in item.result:
                    res: dict[str, Any] = {}
                    if r.extracted_content:
                        res["extracted_content"] = r.extracted_content
                    if r.error:
                        res["error"] = r.error
                    if r.is_done:
                        res["is_done"] = True
                    if res:
                        step_results.append(res)
                if step_results:
                    step["results"] = step_results

            steps.append(step)
    except Exception as exc:
        logger.warning("Failed to build detailed steps: %s", exc)

    # Collected extracted content across all steps
    extracted = []
    try:
        extracted = [c for c in history.extracted_content() if c]
    except Exception:
        pass

    # Filter out None URLs
    all_urls = []
    try:
        all_urls = [u for u in history.urls() if u]
    except Exception:
        pass

    # Filter out None errors
    all_errors = []
    try:
        all_errors = [e for e in history.errors() if e]
    except Exception:
        pass

    return {
        "final_result": history.final_result(),
        "is_successful": history.is_successful(),
        "number_of_steps": history.number_of_steps(),
        "total_duration_seconds": history.total_duration_seconds(),
        "urls": all_urls,
        "errors": all_errors,
        "extracted_content": extracted,
        "steps": steps,
    }
