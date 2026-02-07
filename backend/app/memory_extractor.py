"""
LLM-Based Memory Extraction for Surf.

Analyzes conversations and extracts meaningful facts, preferences, and outcomes
to store in Zep's knowledge graph instead of raw messages.
"""

import asyncio
import json
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)


class FactType(str, Enum):
    """Types of facts that can be extracted from conversation."""
    PREFERENCE = "preference"      # User preferences (e.g., "I prefer dark mode")
    PERSONAL_FACT = "personal"     # Personal information (e.g., "My name is...")
    TASK_OUTCOME = "outcome"       # Important task results (e.g., "Booked flight to NYC")
    CORRECTION = "correction"      # User corrections (e.g., "Actually, my email is...")


@dataclass
class MemoryFact:
    """A single fact extracted from conversation."""
    fact_type: FactType
    content: str
    confidence: float = 1.0


EXTRACTION_SYSTEM_PROMPT = """You are a Memory Archivist. Your task is to extract meaningful, persistent memory entries from conversations to build a long-term user profile.

### CATEGORIES TO EXTRACT:
1. **Factual/Biographical**: Concrete facts (name, location, occupation, relationships).
2. **Preferences**: Likes, dislikes, favorites, style/communication preferences.
3. **Behavioural Patterns**: Habits, routines, workflows.
4. **Goals & Aspirations**: Short/long-term objectives, projects.
5. **Episodic Events**: Significant life events or milestones.
6. **Knowledge & Expertise**: Skills, background, domain knowledge.
7. **Constraints**: Limitations, boundaries, dietary/medical needs.
8. **Relationships**: Social context, important connections.
9. **Emotional Context**: Recurring emotional themes or triggers.
10. **Interaction Patterns**: How the user prefers to interact.

### INFERENCE RULES (CRITICAL):
- **Content Consumption**: If user searches for music, movies, or art (e.g., "Play Drake"), INFER a preference (e.g., "Vihaan likes Drake").
- **Tools/Services**: If user asks for a specific tool (e.g., "Use Google"), INFER a preference.

### STRICT EXCLUSIONS - DO NOT EXTRACT:
- **Generic Browser Actions**: "Clicked on...", "Visited...", "Opened tab..."
- **Task Outcomes**: "Found website...", "Done searching...", "Successful search..."
- **Chit-chat**: "Okay", "Thanks", "Hello", "I'm good"

### FORMATTING RULES:
1. **User Name**: Always use the provided name `{user_name}` instead of "User" or "I".
2. **Atomic Facts**: Each fact must be self-contained and understandable without context.
3. **JSON Structure**: Return a JSON array of objects with `content`, `type`, and `confidence`.

### TYPE MAPPING (Map categories to valid types):
- **preference**: Use for Categories 2, 3, 7, 9, 10 (Likes, Habits, Constraints).
- **personal**: Use for Categories 1, 4, 5, 6, 8 (Facts, Goals, Events, Skills).
- **correction**: Use for explicit corrections to previous knowledge.

Example Output:
```json
[
  { "type": "preference", "content": "{user_name} prefers dark mode", "confidence": 1.0 },
  { "type": "personal", "content": "{user_name} lives in London", "confidence": 1.0 }
]
```

If no meaningful facts are found, return `[]`.
"""


client = OpenAI(api_key=settings.openai_api_key)


async def extract_memory_facts(
    messages: list[dict[str, str]],
    existing_context: str = "",
    user_name: str = "User"
) -> list[MemoryFact]:
    """
    Analyze conversation messages and extract meaningful facts.
    
    Args:
        messages: List of {"role": "user"|"assistant", "content": "..."} dicts
        existing_context: Current Zep context to avoid duplicates
        user_name: Name of the user for entity linking
        
    Returns:
        List of MemoryFact objects worth storing
    """
    if not messages:
        return []
    
    # Build the conversation text for analysis
    conversation_text = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in messages
    )
    
    # Build the prompt
    user_prompt = f"""Analyze this conversation for user '{user_name}' and extract meaningful facts.
REMEMBER: Ignore all browser navigation steps and search actions.

--- CONVERSATION ---
{conversation_text}
--- END CONVERSATION ---"""

    if existing_context:
        user_prompt += f"""

--- EXISTING CONTEXT (do not duplicate) ---
{existing_context}
--- END EXISTING CONTEXT ---"""

    def _call():
        return client.chat.completions.create(
            model="gpt-4o-mini",  # Fast and cheap for extraction
            messages=[
                {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2,  # Low temperature for consistent extraction
            response_format={"type": "json_object"}
        )

    try:
        response = await asyncio.to_thread(_call)
        content = response.choices[0].message.content
        
        logger.debug(f"[MemoryExtractor] Raw LLM response: {content}")
        
        # Clean up markdown code blocks if present
        if content.startswith("```"):
            # Remove first line (```json) and last line (```)
            content = "\n".join(content.split("\n")[1:-1])
            
        # Parse the JSON response
        data = json.loads(content)
        
        # Handle various response formats:
        # 1. {"facts": [...]}
        # 2. [...]
        # 3. {...} (single fact)
        
        if isinstance(data, dict):
            if "facts" in data and isinstance(data["facts"], list):
                facts_data = data["facts"]
            elif "type" in data and "content" in data:
                # Single fact returned as direct object
                facts_data = [data]
            else:
                # Empty dict or unrecognized format -> assume no facts
                facts_data = []
        elif isinstance(data, list):
            facts_data = data
        else:
            logger.warning(f"[MemoryExtractor] Unexpected response format: {content[:200]}")
            return []
        
        # Convert to MemoryFact objects
        facts = []
        for item in facts_data:
            if not isinstance(item, dict):
                continue
            try:
                fact_type = FactType(item.get("type", "personal"))
                content = item.get("content", "")
                confidence = float(item.get("confidence", 1.0))
                
                if content:  # Only add non-empty facts
                    facts.append(MemoryFact(
                        fact_type=fact_type,
                        content=content,
                        confidence=confidence
                    ))
            except (ValueError, KeyError) as e:
                logger.warning(f"[MemoryExtractor] Skipping invalid fact: {item}, error: {e}")
        
        if facts:
            logger.info(f"[MemoryExtractor] Extracted {len(facts)} facts: {[f.content[:50] for f in facts]}")
        else:
            logger.debug("[MemoryExtractor] No meaningful facts extracted")
            
        return facts
        
    except json.JSONDecodeError as e:
        logger.error(f"[MemoryExtractor] Failed to parse JSON response: {e}")
        return []
    except Exception as e:
        logger.error(f"[MemoryExtractor] Extraction failed: {e}")
        return []


class ConversationBuffer:
    """
    Buffers conversation messages and triggers extraction periodically.
    """
    
    def __init__(
        self,
        on_facts_extracted: callable,
        buffer_size: int = 6,
        get_existing_context: callable = None,
        user_name: str = "User"
    ):
        """
        Args:
            on_facts_extracted: Async callback(facts: list[MemoryFact]) when extraction completes
            buffer_size: Number of messages before triggering extraction
            get_existing_context: Optional callable returning current Zep context
            user_name: Name of the user for entity linking
        """
        self.buffer: list[dict[str, str]] = []
        self.buffer_size = buffer_size
        self.on_facts_extracted = on_facts_extracted
        self.get_existing_context = get_existing_context
        self.user_name = user_name
        self._extraction_task: Optional[asyncio.Task] = None
    
    def add_message(self, role: str, content: str):
        """Add a message to the buffer."""
        if not content or not content.strip():
            return
            
        self.buffer.append({"role": role, "content": content})
        logger.debug(f"[MemoryExtractor] Buffered {role} message ({len(self.buffer)}/{self.buffer_size})")
        
        # Check if we should trigger extraction
        if len(self.buffer) >= self.buffer_size:
            self._trigger_extraction()
    
    def _trigger_extraction(self):
        """Trigger async extraction of buffered messages."""
        if not self.buffer:
            return
            
        # Take current buffer and clear it
        messages_to_process = self.buffer.copy()
        self.buffer = []
        
        # Start extraction in background
        self._extraction_task = asyncio.create_task(
            self._extract_and_callback(messages_to_process)
        )
    
    async def _extract_and_callback(self, messages: list[dict[str, str]]):
        """Run extraction and call the callback with results."""
        try:
            existing_context = ""
            if self.get_existing_context:
                try:
                    existing_context = self.get_existing_context()
                except Exception:
                    pass
            
            facts = await extract_memory_facts(messages, existing_context, self.user_name)
            
            if facts and self.on_facts_extracted:
                await self.on_facts_extracted(facts)
                
        except Exception as e:
            logger.error(f"[MemoryExtractor] Extraction task failed: {e}")
    
    async def flush(self):
        """Force extraction of any remaining buffered messages."""
        if self.buffer:
            self._trigger_extraction()
        
        # Wait for any pending extraction to complete
        if self._extraction_task and not self._extraction_task.done():
            try:
                await asyncio.wait_for(self._extraction_task, timeout=10.0)
            except asyncio.TimeoutError:
                logger.warning("[MemoryExtractor] Flush timeout waiting for extraction")
