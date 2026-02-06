"""
Surf - Memory-Augmented Browser Agent

A voice-controlled browser automation assistant with persistent memory.
"""

import asyncio
from agents.conversational import ConversationalAgent


async def main():
    """Launch the Surf conversational agent."""
    print("=" * 50)
    print("  SURF - Voice-Controlled Browser Assistant")
    print("=" * 50)
    print()
    print("Starting up... (make sure your microphone is ready)")
    print()
    
    agent = ConversationalAgent()
    
    try:
        await agent.run()
    except KeyboardInterrupt:
        print("\n[Surf] Goodbye!")
        await agent.stop()


if __name__ == "__main__":
    asyncio.run(main())