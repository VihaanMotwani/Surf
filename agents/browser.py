"""
Browser Agent wrapper for Surf.

Wraps browser-use Agent to accept enriched task context from memory.
"""

import asyncio
from dataclasses import dataclass
from typing import Optional
from browser_use import Agent, Browser


@dataclass
class BrowserTaskResult:
    """Result from a browser task execution."""
    task: str
    success: bool
    result: str
    error: Optional[str] = None


class BrowserAgent:
    """
    Browser automation agent that wraps browser-use.
    
    Accepts tasks enriched with memory context and returns structured results.
    """
    
    def __init__(self):
        self.browser = Browser()
    
    async def execute(self, task: str, context: str = "") -> BrowserTaskResult:
        """
        Execute a browser task with optional memory context.
        
        Args:
            task: The task description to execute
            context: Memory context from Zep (user preferences, history, etc.)
        
        Returns:
            BrowserTaskResult with success status and outcome
        """
        # Enrich task with context if available
        enriched_task = task
        if context:
            enriched_task = f"""
{context}

---
CURRENT TASK: {task}
"""
        
        try:
            agent = Agent(
                task=enriched_task,
                browser=self.browser,
            )
            
            history = await agent.run()
            
            # Extract final result from history
            result_text = self._extract_result(history)
            
            return BrowserTaskResult(
                task=task,
                success=True,
                result=result_text,
            )
            
        except Exception as e:
            return BrowserTaskResult(
                task=task,
                success=False,
                result="",
                error=str(e),
            )
    
    def _extract_result(self, history) -> str:
        """Extract a summary result from the agent history."""
        if not history:
            return "Task completed"
        
        # Get the last action result if available
        if hasattr(history, 'final_result') and history.final_result:
            return str(history.final_result)
        
        return "Task completed successfully"
    
    async def close(self):
        """Cleanup browser resources."""
        # browser-use manages browser lifecycle internally
        pass
