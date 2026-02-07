
import asyncio
import os
import sys
from dotenv import load_dotenv

# Load env
load_dotenv(os.path.join(os.getcwd(), "backend", ".env"))
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.memory_extractor import extract_memory_facts, FactType

async def test_extractor():
    print("Testing Memory Extractor on Trivia vs. Personal Info...")
    
    # CASE 1: Trivia / General Knowledge
    # This caused the pollution in the past
    trivia_messages = [
        {"role": "user", "content": "Who is Drake?"},
        {"role": "assistant", "content": "Aubrey Drake Graham is a Canadian rapper and singer from Toronto. He has won 41 Billboard Music Awards."},
        {"role": "user", "content": "Wow that's a lot."},
    ]
    
    print(f"\n1. Testing Trivia Conversation...")
    facts = await extract_memory_facts(trivia_messages)
    if not facts:
        print("✅ SUCCESS: No facts extracted from trivia.")
    else:
        print(f"❌ FAILURE: Extracted trivia facts: {facts}")
        
    # CASE 2: Personal Fact
    personal_messages = [
        {"role": "user", "content": "My name is Vihaan and I live in San Francisco."},
        {"role": "assistant", "content": "Nice to meet you Vihaan."},
    ]
    
    print(f"\n2. Testing Personal Fact Conversation...")
    facts = await extract_memory_facts(personal_messages)
    passed = any(f.fact_type == FactType.PERSONAL_FACT and "Vihaan" in f.content for f in facts)
    
    if passed:
        print(f"✅ SUCCESS: Extracted personal fact: {[f.content for f in facts]}")
    else:
        print(f"❌ FAILURE: Failed to extract personal fact. Got: {facts}")

if __name__ == "__main__":
    asyncio.run(test_extractor())
