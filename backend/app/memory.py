"""
Zep Memory Layer for Surf Browser Agent.

Provides persistent memory for user preferences, task history, and website-specific knowledge
using Zep's knowledge graph and context retrieval.
"""

import os
import uuid
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from zep_cloud.client import Zep
from zep_cloud.types import Message

logger = logging.getLogger(__name__)


class ZepMemory:
    """
    Memory wrapper for Zep that handles user/thread management and context retrieval.

    Single-user mode: Uses a fixed user ID from environment, creates new threads per session,
    but all memory persists in the user's knowledge graph.
    """

    def __init__(self, api_key: str, user_id: str = "surf_local_user", user_name: str = "User"):
        self.client = Zep(api_key=api_key)
        self.user_id = user_id
        self.user_name = user_name
        self.thread_id: Optional[str] = None

        self._ensure_user_exists()
        self._create_session_thread()

    def _ensure_user_exists(self) -> None:
        """Create user if it doesn't exist."""
        try:
            self.client.user.get(self.user_id)
        except Exception:
            self.client.user.add(
                user_id=self.user_id,
                first_name=self.user_name,
            )

    def _create_session_thread(self) -> None:
        """Create a new thread for this session."""
        self.thread_id = f"session_{uuid.uuid4().hex[:12]}"
        self.client.thread.create(
            thread_id=self.thread_id,
            user_id=self.user_id,
        )

    def get_context(self) -> str:
        """
        Retrieve the Zep context block for the current user.

        Returns a formatted string containing:
        - Thread-level user context (if available)
        - User's knowledge graph facts (preferences, previous tasks, etc.)
        """
        context_parts = []

        # 1. Try to get thread-level context
        if self.thread_id:
            try:
                user_context = self.client.thread.get_user_context(thread_id=self.thread_id)
                if user_context.context:
                    context_parts.append(f"User Summary:\n{user_context.context}")
            except Exception as e:
                logger.debug(f"No thread context available: {e}")

        # 2. Get user's knowledge graph facts (these persist across sessions)
        try:
            search_results = self.client.graph.search(
                user_id=self.user_id,
                query="user information preferences facts history",
                limit=20
            )
            
            if hasattr(search_results, 'edges') and search_results.edges:
                facts = []
                for edge in search_results.edges[:15]:  # Limit to avoid context bloat
                    fact = edge.fact if hasattr(edge, 'fact') else str(edge)
                    if fact:
                        facts.append(f"- {fact}")
                
                if facts:
                    context_parts.append(f"Known Facts About User:\n" + "\n".join(facts))
                    
        except Exception as e:
            logger.debug(f"No graph facts available: {e}")

        return "\n\n".join(context_parts) if context_parts else ""

    def add_message(self, role: str, content: str, name: Optional[str] = None) -> None:
        """
        Add a message to the current thread.

        Args:
            role: "user" or "assistant"
            content: The message content
            name: Optional speaker name (helps with graph construction)
        """
        if not self.thread_id:
            return

        message = Message(
            created_at=datetime.now(timezone.utc).isoformat(),
            role=role,
            content=content,
            name=name or (self.user_name if role == "user" else "Surf"),
        )

        try:
            self.client.thread.add_messages(self.thread_id, messages=[message])
        except Exception as e:
            logger.warning(f"Error adding message: {e}")

    def store_browser_result(self, task: str, result: str, success: bool) -> None:
        """
        Store browser task result as business data in the user's knowledge graph.

        Args:
            task: The task description that was executed
            result: The outcome/result of the task
            success: Whether the task completed successfully
        """
        event_data = {
            "user_id": self.user_id,
            "event_type": "browser_task_completed",
            "task": task,
            "result": result,
            "success": success,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        try:
            self.client.graph.add(
                user_id=self.user_id,
                type="json",
                data=json.dumps(event_data),
            )
        except Exception as e:
            logger.warning(f"Error storing browser result: {e}")

    def add_user_preference(self, preference: str) -> None:
        """
        Explicitly add a user preference to the knowledge graph.

        Args:
            preference: Natural language description of the preference
        """
        try:
            self.client.graph.add(
                user_id=self.user_id,
                type="text",
                data=f"User preference: {preference}",
            )
        except Exception as e:
            logger.warning(f"Error adding preference: {e}")

    def store_extracted_facts(self, facts: list) -> None:
        """
        Store LLM-extracted facts to the knowledge graph.

        Args:
            facts: List of MemoryFact objects with fact_type and content
        """
        for fact in facts:
            try:
                # Format: content (clean natural language helps Zep deduplication)
                fact_text = fact.content
                self.client.graph.add(
                    user_id=self.user_id,
                    type="text",
                    data=fact_text,
                )
                logger.info(f"Stored extracted fact: {fact_text[:80]}...")
            except Exception as e:
                logger.warning(f"Error storing extracted fact: {e}")


def create_memory(api_key: str | None, user_id: str = "surf_local_user", user_name: str = "User") -> ZepMemory | None:
    """Factory that returns a ZepMemory instance or None if Zep is not configured."""
    if not api_key:
        logger.info("ZEP_API_KEY not set — Zep memory disabled")
        return None
    try:
        return ZepMemory(api_key=api_key, user_id=user_id, user_name=user_name)
    except Exception as e:
        logger.warning(f"Failed to initialize Zep memory: {e}")
        return None


# Global memory instance for API routes
_memory_instance: Optional[ZepMemory] = None


def get_memory_client() -> ZepMemory:
    """
    Get the global memory client instance for API routes.

    Raises:
        RuntimeError: If Zep is not configured
    """
    global _memory_instance

    if _memory_instance is None:
        api_key = os.environ.get("ZEP_API_KEY")
        user_id = os.environ.get("ZEP_USER_ID", "surf_local_user")
        user_name = os.environ.get("ZEP_USER_NAME", "User")

        _memory_instance = create_memory(api_key, user_id, user_name)

    if _memory_instance is None:
        raise RuntimeError("Zep memory is not configured. Set ZEP_API_KEY environment variable.")

    return _memory_instance
