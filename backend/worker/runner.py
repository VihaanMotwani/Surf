import json
from typing import Any

from dotenv import load_dotenv

from browser_use import Agent, Browser, ChatBrowserUse

load_dotenv()


def to_jsonable(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))


async def run_browser_use_task(task_prompt: str):
    browser = Browser()
    await browser.start()
    try:
        llm = ChatBrowserUse()
        agent = Agent(task=task_prompt, llm=llm, browser=browser)
        history = await agent.run()
        return history
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
