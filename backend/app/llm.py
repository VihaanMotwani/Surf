from __future__ import annotations

import asyncio
from typing import Iterable

from openai import OpenAI

from app.config import settings
from app.models import Message


BASE_SYSTEM_PROMPT = (
    "You are a helpful assistant. When the user wants you to perform a browser task, "
    "ask for confirmation and end your response with a separate line starting with "
    "TASK_PROMPT: followed by a short imperative task for a browser automation agent. "
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
