"""
Message event broadcasting for real-time message notifications.

This module provides a mechanism to notify the frontend when new messages
are created outside of the normal request/response cycle (e.g., auto-summaries).
"""

import asyncio
import logging
from typing import AsyncGenerator
from collections import defaultdict

logger = logging.getLogger(__name__)

# Store active SSE connections per session
# session_id -> list of queues
_session_queues: dict[str, list[asyncio.Queue]] = defaultdict(list)


def broadcast_message_event(session_id: str, message_data: dict):
    """
    Broadcast a message event to all active listeners for a session.

    Args:
        session_id: The session ID
        message_data: Message data to broadcast (must be JSON-serializable)
    """
    queues = _session_queues.get(session_id, [])
    if not queues:
        logger.debug(f"No active listeners for session {session_id}, message event not broadcasted")
        return

    logger.info(f"Broadcasting message event to {len(queues)} listener(s) for session {session_id}")
    for queue in queues:
        try:
            queue.put_nowait(message_data)
        except asyncio.QueueFull:
            logger.warning(f"Queue full for session {session_id}, dropping message event")


async def message_event_stream(session_id: str) -> AsyncGenerator[dict, None]:
    """
    Generate an async stream of message events for a session.

    This is used by the SSE endpoint to keep connections alive and
    push new message notifications as they arrive.

    Args:
        session_id: The session ID to subscribe to

    Yields:
        dict: Message event data
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    _session_queues[session_id].append(queue)

    try:
        logger.info(f"New message event subscriber for session {session_id}")
        while True:
            # Wait for new message events (with timeout to send keepalive)
            try:
                message_data = await asyncio.wait_for(queue.get(), timeout=30.0)
                yield message_data
            except asyncio.TimeoutError:
                # Send keepalive comment to prevent connection timeout
                yield {"type": "keepalive"}
    finally:
        # Clean up when connection closes
        _session_queues[session_id].remove(queue)
        if not _session_queues[session_id]:
            del _session_queues[session_id]
        logger.info(f"Message event subscriber disconnected for session {session_id}")
