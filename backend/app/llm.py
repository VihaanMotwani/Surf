from __future__ import annotations

import asyncio
from typing import Iterable

from openai import OpenAI

from app.config import settings
from app.models import Message


BASE_SYSTEM_PROMPT = (
    "You are a helpful assistant. When the user wants you to perform a browser task, "
    "briefly acknowledge what you will do and end your response with a separate line starting with "
    "TASK_PROMPT: followed by a short imperative task for a browser automation agent. "
    "Do not ask for confirmation — just proceed. "
    "If no task should be run, do not include a TASK_PROMPT line."
)

TASK_PROMPT_MARKERS = ["\nTASK_PROMPT:", "TASK_PROMPT:"]

client = OpenAI(api_key=settings.openai_api_key)


def build_input(messages: list[Message], memory_context: str = "") -> list[dict[str, str]]:
    system_prompt = BASE_SYSTEM_PROMPT
    if memory_context:
        system_prompt += (
            "\n\n--- USER CONTEXT (from memory) ---\n"
            + memory_context
            + "\n--- END CONTEXT ---"
        )
    payload: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for msg in messages:
        if msg.role not in {"user", "assistant"}:
            continue
        payload.append({"role": msg.role, "content": msg.content})
    return payload


def parse_task_prompt(text: str) -> tuple[str, str | None]:
    for marker in TASK_PROMPT_MARKERS:
        idx = text.find(marker)
        if idx != -1:
            assistant_text = text[:idx].rstrip()
            task_prompt = text[idx + len(marker) :].strip()
            return assistant_text, task_prompt or None
    return text.strip(), None


async def generate_assistant_text(messages: list[Message], memory_context: str = "") -> str:
    def _call():
        return client.responses.create(
            model=settings.openai_model,
            input=build_input(messages, memory_context=memory_context),
        )

    response = await asyncio.to_thread(_call)
    output_text = getattr(response, "output_text", None)
    if output_text:
        return output_text
    return "I'm not sure how to respond to that."


def stream_assistant_text(messages: list[Message], memory_context: str = "") -> Iterable[str]:
    stream = client.responses.create(
        model=settings.openai_model,
        input=build_input(messages, memory_context=memory_context),
        stream=True,
    )
    for event in stream:
        if getattr(event, "type", None) == "response.output_text.delta":
            delta = getattr(event, "delta", "")
            if delta:
                yield delta


DESCRIBE_SYSTEM_PROMPT = (
    "You are a helpful assistant describing what is visible on a browser screen. "
    "Describe the page contents in detail, as if explaining to someone who cannot see it. "
    "Mention key UI elements, text content, images, and layout."
)

DESCRIBE_KEYWORDS = ["describe what you see", "describe that", "describe the screen", "what do you see", "what's on the screen", "what is on the screen"]


def is_describe_request(text: str) -> bool:
    """Check if the user message is asking to describe the screen."""
    lower = text.lower().strip()
    return any(kw in lower for kw in DESCRIBE_KEYWORDS)


def stream_describe_screenshot(screenshot_b64: str, user_prompt: str) -> Iterable[str]:
    """Send a screenshot to the vision model and stream the description."""
    input_messages = [
        {"role": "system", "content": DESCRIBE_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": user_prompt or "Describe what you see on this screen."},
                {
                    "type": "input_image",
                    "image_url": f"data:image/png;base64,{screenshot_b64}",
                },
            ],
        },
    ]
    stream = client.responses.create(
        model=settings.openai_model,
        input=input_messages,
        stream=True,
    )
    for event in stream:
        if getattr(event, "type", None) == "response.output_text.delta":
            delta = getattr(event, "delta", "")
            if delta:
                yield delta
